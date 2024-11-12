import fastifyJwt from "@fastify/jwt";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { readFileSync } from "fs";
import path from "path";
import { IPlayer, TargetPlayer } from "../interfaces/player.interface";
import { ALLOWED_GRADES, JWT_PLAYER_COOKIE_NAME } from "../config";
import { COOKIE_OPTS } from "../config/cookieOpts";
import Players from "../models/players";
import Game from "../models/game";

const playerAuthPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  if (!fastify.mongo.db) return fastify.close();
  const players = new Players(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_PLAYERS!)
  );
  const game = new Game(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_GAME!)
  );

  fastify.register(fastifyJwt, {
    secret: readFileSync(
      path.join(__dirname, "..", "..", "jwtSecretPlayer.key")
    ),
    sign: {
      algorithm: "HS256",
      expiresIn: 60 * 60 * 24 * 10, // 10 days
    },
    cookie: {
      cookieName: JWT_PLAYER_COOKIE_NAME,
      signed: true,
    },
    namespace: "player",
    jwtVerify: "playerJWTVerify",
    jwtSign: "playerJWTSign",
  });

  fastify.decorate("playerAuthorize", authorize);

  fastify.post<{ Body: Pick<IPlayer, "name" | "email" | "grade"> }>(
    "/signup",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            grade: { type: "string", maxLength: 6 },
          },
          required: ["name", "email", "grade"],
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("Body is required");
      }

      // Check game status
      const { signupIsClosed } = await game.getSettings();
      if (signupIsClosed) {
        return reply.serviceUnavailable("Signups are currently closed");
      }

      try {
        const email: string =
          req.body.email
            .replaceAll(" ", "")
            .toLowerCase()
            .replaceAll(".pch@procivitas.se", "") + ".pch@procivitas.se";
        const existingPlayer = await players.getPlayerByEmail(email);
        if (existingPlayer) {
          return reply.conflict("Player already exists");
        }

        // Check if grade is one of the allowed grade values
        if (!ALLOWED_GRADES.includes(req.body.grade.toUpperCase())) {
          return reply.forbidden("Grade does not exist");
        }

        /**
         * Generate the unique id for the player
         * If a player dies, this id is used by the player who killed
         * to earn points in the game.
         * This is a resource-intensive operation, therefore we cap
         * the operation after n retries.
         */
        const MAX_ID_GEN_RETRIES = 10;
        let id: string;
        let retries = 0;
        do {
          id = Math.floor(100000 + Math.random() * 900000).toString();
          retries++;
          if (retries >= MAX_ID_GEN_RETRIES) {
            return reply.internalServerError("Failed to generate a unique id");
          }
        } while (await players.getPlayerById(id));

        /**
         * We attempt to generate a target for the player by checking if there
         * are any un-assigned players in the database. If we can't find any,
         * 'target' becomes null.
         */
        const target = await players.db.findOneAndUpdate(
          { isTarget: false, alive: true },
          { $set: { isTarget: true } },
          { projection: { name: 1, id: 1, grade: 1 } }
        );

        // Prettify the player name
        const name: string = req.body.name
          .split(" ")
          .map((word) => word[0].toUpperCase() + word.substring(1))
          .join(" ")
          .split("-")
          .map((word) => word[0].toUpperCase() + word.substring(1))
          .join("-");

        // Prettify the player grade
        const grade: string = req.body.grade.toUpperCase();

        const creationTime = new Date().getTime();
        await players.db.insertOne({
          id,
          email,
          name,
          grade,
          creationTime,
          latestKillTime: creationTime,
          fastestKill: Number.MAX_SAFE_INTEGER,
          target,
          alive: true,
          isTarget: false,
          kills: 0,
        });

        const token = await reply.playerJWTSign(
          {
            id,
            name,
            grade,
            email,
          },
          {
            sign: {
              sub: id,
            },
          }
        );

        reply.setCookie(JWT_PLAYER_COOKIE_NAME, token, COOKIE_OPTS);
        reply.generateCsrf();

        /**
         * Attempt to send a welcome email with id using Mailgun
         */
        fastify.sendPlayerWelcomeEmail(name, id, email);

        return {
          name,
          grade,
          email,
        };
      } catch (err) {
        fastify.log.warn(err);
        reply.internalServerError("There was an error signing up a new player");
      }
    }
  );

  fastify.post<{ Body: Pick<IPlayer, "id"> }>(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("ID is required");
      }

      // Check game status
      const { isPaused } = await game.getSettings();
      if (isPaused) {
        return reply.serviceUnavailable("Game is currently paused");
      }

      const player = await players.db.findOne(
        { id: req.body.id },
        { projection: { "target.id": 0, "target._id": 0 } }
      );
      if (!player) {
        return reply.notFound("Couldn't find id");
      }
      if (!player.alive) {
        return reply.unauthorized("Player is dead");
      }
      const token = await reply.playerJWTSign(
        {
          id: player.id,
          name: player.name,
          grade: player.grade,
          email: player.email,
        },
        {
          sign: {
            sub: player.id,
          },
        }
      );

      reply.setCookie(JWT_PLAYER_COOKIE_NAME, token, COOKIE_OPTS);
      reply.generateCsrf();

      return {
        id: player.id,
        name: player.name,
        grade: player.grade,
        email: player.email,
        kills: player.kills,
        fastestKill: player.fastestKill,
        target: player.target,
      };
    }
  );

  async function authorize(req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.playerJWTVerify();
    } catch (e) {
      return reply.unauthorized("Token could not be verified");
    }
  }

  done();
};

export default fp(playerAuthPlugin, { name: "playerAuth" });
