import fastifyJwt from "@fastify/jwt";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import bcrypt from "bcrypt";
import { readFileSync } from "fs";
import path from "path";
import { CookieSerializeOptions } from "@fastify/cookie";
import { IPlayer } from "../interfaces/player.interface";

const playerAuthPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  const env = process.env.NODE_ENV;
  const JWT_COOKIE_NAME = "token";
  const cookieOpts: CookieSerializeOptions = {
    path: "/",
    secure: env === "production",
    httpOnly: true,
    sameSite: "strict",
    signed: false,
    maxAge: 60 * 60 * 24 * 10, //10 days
  };
  if (!fastify.mongo.db) return fastify.close();
  const players = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_PLAYERS!
  );

  fastify.register(fastifyJwt, {
    secret: readFileSync(path.join(__dirname, "..", "..", "secret_key_player")),
    sign: {
      algorithm: "HS256",
      expiresIn: 60 * 60 * 24 * 10, // 10 days
    },
    cookie: {
      cookieName: JWT_COOKIE_NAME,
      signed: true,
    },
    namespace: "player",
    jwtVerify: "playerJWTVerify",
    jwtSign: "playerJWTSign",
  });

  fastify.decorate("playerAuthorize", authorize);

  fastify.post<{ Body: Pick<IPlayer, "name" | "email" | "grade"> }>(
    "/player/new",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            grade: { type: "string", maxLength: 6 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("Body is required");
      }
      try {
        const email: string =
          req.body.email
            .replaceAll(" ", "")
            .toLowerCase()
            .replace(".pch@procivitas.se", "") + ".pch@procivitas.se";
        const existingPlayer = await players.findOne({ email });
        if (existingPlayer) {
          return reply.badRequest("Player already exists");
        }

        // Generate the unique id for the player
        // If a player dies, this id is used by the player who killed
        // to earn points in the game.
        // This is a resource-intensive operation, therefore we cap
        // the operation after n retries.
        const MAX_ID_GEN_RETRIES = 10;
        let id: string;
        let retries = 0;
        do {
          id = Math.floor(100000 + Math.random() * 900000).toString();
          retries++;
          if (retries >= MAX_ID_GEN_RETRIES) {
            return reply.internalServerError("Failed to generate a unique id");
          }
        } while (await players.findOne({ id }));

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
        players.insertOne({
          id,
          creationTime,
          email,
          name,
          grade,
          latestKillTime: creationTime,
          fastestKill: null,
          target: {
            id: "",
            name: "",
            grade: "",
          },
          alive: true,
          kills: 0,
        });

        const token = await reply.playerJWTSign(
          {
            id,
            name,
            grade,
          },
          {
            sign: {
              sub: id,
            },
          }
        );

        reply.setCookie(JWT_COOKIE_NAME, token, cookieOpts);
        reply.generateCsrf();

        return {
          id,
          name,
          grade,
        };
      } catch (err) {
        reply.internalServerError("There was an error signing up a new player");
      }
    }
  );

  fastify.post<{ Body: Pick<IPlayer, "id"> }>(
    "/player/login",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("ID is required");
      }
      const player = await players.findOne({ id: req.body.id });
      if (!player) {
        return reply.notFound("Couldn't find id");
      }
      const token = await reply.playerJWTSign(
        {
          id: player.id,
          name: player.name,
          grade: player.grade,
        },
        {
          sign: {
            sub: player.id,
          },
        }
      );

      reply.setCookie(JWT_COOKIE_NAME, token, cookieOpts);
      reply.generateCsrf();

      return {
        id: player.id,
        name: player.name,
        grade: player.grade,
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
