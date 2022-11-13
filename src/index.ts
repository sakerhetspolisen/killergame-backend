import * as dotenv from "dotenv";
dotenv.config();
import fastify, { FastifyInstance } from "fastify";
import fastifySensible from "@fastify/sensible";
import fastifyCORS from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMongodb from "@fastify/mongodb";
import logger from "./winstonLogger";
import { IPlayer, IServerPlayer } from "./interfaces/player.interface";

const server = fastify();
const port = Number(process.env.PORT) || 9001;
server.register(fastifySensible);
server.register(fastifyCORS, {
  origin: ["http://killerga.me", "https://killerga.me"],
  methods: ["GET", "POST", "DELETE"],
});
server.register(fastifyRateLimit, {
  max: 84,
  timeWindow: "1 minute",
});
server.register(fastifyMongodb, {
  url: "mongodb://localhost/killergame",
});

server.decorate("shuffleArray", function shuffle(array: Array<any>) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
});

declare module "fastify" {
  interface FastifyInstance {
    shuffleArray: (arr: Array<any>) => Array<any>;
  }
}

/**
 *
 * Player endpoints
 */
const playerRoutes = (fastify: FastifyInstance, options: any, done: any) => {
  if (!server.mongo.db) return fastify.close();
  const players = server.mongo.db.collection("players");
  const activatedStops = server.mongo.db.collection("activatedStops");
  fastify.post<{ Body: IPlayer; Reply: IServerPlayer }>(
    "/player",
    {
      schema: {
        body: {
          type: "object",
          required: ["firstName", "lastName", "email", "grade"],
          properties: {
            firstName: { type: "string" },
            lastName: { type: "string" },
            email: { type: "string" },
            grade: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const stops = await activatedStops.findOne({});
      if (stops?.signup) return reply.serviceUnavailable();

      const player = {
        id: Math.floor(100000 + Math.random() * 900000).toString(),
        fastestKill: undefined,
        latestKillTime: Date.now(),
        targetId: undefined,
        kills: 0,
        firstName: request.body.firstName,
        lastName: request.body.lastName,
        email: request.body.email,
        grade: request.body.grade,
      };
      const res = await players.insertOne(player);
      if (res.acknowledged === true) {
        reply.send(player);
      } else reply.internalServerError();
    }
  );

  fastify.get<{ Params: { playerId: string } }>(
    "/player/:playerId",
    async (request, reply) => {
      const { playerId } = request.params;
      const res = await players
        .find({ id: playerId }, { projection: { _id: 0 } })
        .limit(1)
        .toArray();
      const { targetId, ...player } = res[0];
      if (player) {
        const findTargets = await players
          .find(
            { id: targetId },
            { projection: { firstName: 1, lastName: 1, grade: 1, _id: 0 } }
          )
          .limit(1)
          .toArray();
        const target = findTargets[0];
        reply.send(
          target
            ? {
                ...player,
                targetFirstName: target.firstName,
                targetLastName: target.lastName,
                targetGrade: target.grade,
              }
            : player
        );
      } else {
        reply.notFound("Player not found");
      }
    }
  );

  fastify.post<{ Body: { victimId: string; playerId: string } }>(
    "/player/killPlayer",
    {
      schema: {
        body: {
          type: "object",
          required: ["playerId", "victimId"],
          properties: {
            victimId: { type: "string" },
            playerId: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const stops = await activatedStops.findOne({});
      if (stops?.kill) return reply.serviceUnavailable();
      if (!server.mongo.db) return reply.internalServerError();
      const deadPlayers = server.mongo.db.collection("deadPlayers");
      const { victimId, playerId } = request.body;
      const killer = await players.findOne(
        { id: playerId },
        { projection: { _id: 0, targetId: 1, kills: 1, latestKillTime: 1 } }
      );
      if (killer?.targetId === victimId) {
        const victim = await players.findOneAndDelete({ id: victimId });
        if (victim.ok && victim.value) {
          await players.updateOne(
            { id: playerId },
            {
              $set: {
                kills: killer.kills + 1,
                fastestKill: Date.now() - killer.latestKillTime,
                targetId: victim.value?.targetId,
                latestKillTime: Date.now(),
              },
            }
          );
          await deadPlayers.insertOne({ killedBy: playerId, ...victim.value });
          reply.send(`Successfully deleted player ${victimId}.`);
        } else {
          reply.internalServerError("Couldn't find victim");
        }
      } else {
        reply.forbidden("Provided victimId is incorrect");
      }
    }
  );
  done();
};

/**
 *
 * Stats endpoints
 */
const statsRoutes = (fastify: FastifyInstance, options: any, done: any) => {
  if (!server.mongo.db) return fastify.close();
  const players = server.mongo.db.collection("players");
  const deadPlayers = server.mongo.db.collection("deadPlayers");

  fastify.get("/stats/getNOfPlayers", async (request, reply) => {
    const nOfPlayersAlive = await players.estimatedDocumentCount();
    const nOfDeadPlayers = await deadPlayers.estimatedDocumentCount();
    reply.cacheControl("public");
    reply.cacheControl("max-age", 604800);
    reply.send({
      alive: nOfPlayersAlive,
      dead: nOfDeadPlayers,
      total: nOfPlayersAlive + nOfDeadPlayers,
    });
  });

  fastify.get("/stats/getNOfPlayersFromGrades", async (request, reply) => {
    const distinctGrades = await players
      .aggregate([
        {
          $group: {
            _id: { $toLower: "$grade" },
            count: { $sum: 1 },
          },
        },
        {
          $group: {
            _id: null,
            counts: {
              $push: { k: "$_id", v: "$count" },
            },
          },
        },
        {
          $replaceRoot: {
            newRoot: { $arrayToObject: "$counts" },
          },
        },
      ])
      .toArray();
    reply.cacheControl("public");
    reply.cacheControl("max-age", 604800);
    reply.send(distinctGrades[0]);
  });

  fastify.get(
    "/stats/getListOfPlayersWithMostKills",
    async (request, reply) => {
      const topList = await players
        .find(
          { kills: { $ne: 0 } },
          {
            sort: { kills: 1 },
            limit: 10,
            projection: {
              _id: 0,
              kills: 1,
              firstName: 1,
              lastName: 1,
              grade: 1,
            },
          }
        )
        .toArray();
      reply.cacheControl("public");
      reply.cacheControl("max-age", 604800);
      reply.send(topList);
    }
  );

  fastify.get(
    "/stats/getListOfPlayersWithFastestKill",
    async (request, reply) => {
      const topList = await players
        .find(
          { fastestKill: { $ne: undefined } },
          {
            sort: { fastestKill: -1 },
            limit: 10,
            projection: {
              _id: 0,
              fastestKill: 1,
              firstName: 1,
              lastName: 1,
              grade: 1,
            },
          }
        )
        .toArray();
      reply.cacheControl("public");
      reply.cacheControl("max-age", 604800);
      reply.send(topList);
    }
  );

  done();
};

const gameRoutes = (fastify: FastifyInstance, options: any, done: any) => {
  if (!server.mongo.db) return fastify.close();
  const players = server.mongo.db.collection("players");
  const activatedStops = server.mongo.db.collection("activatedStops");

  fastify.get("/game/getStops", async (request, reply) => {
    return reply.send(
      await activatedStops.findOne({}, { projection: { _id: 0 } })
    );
  });

  fastify.post<{ Body: { pass: string }; Reply: string }>(
    "/game/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.body.pass !== "DarlingDialThatNumber777%")
        reply.unauthorized();
      else reply.send("ok");
    }
  );

  fastify.post<{ Body: { password: string }; Reply: string }>(
    "/game/randomize",
    {
      schema: {
        body: {
          type: "object",
          required: ["password"],
          properties: {
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (request.body.password !== "DarlingDialThatNumber777%")
        reply.unauthorized();
      const res = await players
        .find(
          {},
          {
            projection: { _id: 0, id: 1, targetId: 1 },
          }
        )
        .toArray();
      fastify.shuffleArray(res);
      for (let i = 1; i < res.length; i++) {
        res[i]["targetId"] = res[i - 1]["id"];
      }
      res[0]["targetId"] = res[res.length - 1]["id"];
      for (let p of res) {
        await players.updateOne(
          { id: p.id },
          { $set: { targetId: p.targetId } }
        );
      }
      reply.send("ok");
    }
  );

  fastify.get("/game/debug", async (request, reply) => {
    if (request.headers["x-pass"] !== "DarlingDialThatNumber777%")
      reply.unauthorized();
    const res = await players
      .find(
        {},
        {
          projection: { _id: 1, id: 1, targetId: 1, email: 1 },
        }
      )
      .toArray();
    let nonValidTargets: Array<string> = [];
    let playersThatAreNotTargets: Array<string> = [];
    let playersThatAreTargetsMultipleTimes: Array<string> = [];
    let playersWithSamePlayerId: Array<[string, string]> = [];
    let playersWithSameEmail: Array<[string, string]> = [];
    let playersWithoutTarget: Array<string> = [];
    for (let a of res) {
      let found = false;
      let timesFoundAsTarget = 0;
      if (!a["targetId"]) playersWithoutTarget.push(a["id"]);
      for (let b of res) {
        if (a["targetId"] === b["id"]) found = true;
        if (a["id"] === a["targetId"]) timesFoundAsTarget += 1;
        if (a["id"] === b["id"] && a["_id"] !== b["_id"])
          playersWithSamePlayerId.push([a["email"], b["email"]]);
        if (a["email"] === b["email"] && a["_id"] !== b["_id"])
          playersWithSameEmail.push([a["id"], b["id"]]);
      }
      if (!found && a["targetId"] !== null) nonValidTargets.push(a["targetId"]);
      if (timesFoundAsTarget === 0) playersThatAreNotTargets.push(a["id"]);
      if (timesFoundAsTarget > 1)
        playersThatAreTargetsMultipleTimes.push(a["id"]);
    }
    reply.send({
      nonValidTargets,
      playersThatAreNotTargets,
      playersThatAreTargetsMultipleTimes,
      playersWithSamePlayerId,
      playersWithSameEmail,
      playersWithoutTarget,
    });
  });

  fastify.post<{ Body: { playerId: string; password: string } }>(
    "/game/revivePlayer",
    {
      schema: {
        body: {
          type: "object",
          required: ["playerId", "victimId"],
          properties: {
            playerId: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!server.mongo.db) return reply.internalServerError();
      const { playerId, password } = request.body;
      if (password !== "DarlingDialThatNumber777%") reply.unauthorized();
      const deadPlayers = server.mongo.db.collection("deadPlayers");
      const player = await deadPlayers.findOne({ id: playerId });
      if (player) {
        const tempPlayer = await players
          .findOne({})
          .then((p) => (p ? p : { targetId: null, id: null }));
        if (tempPlayer.targetId) {
          let playerWithoutKilledBy = { ...player };
          delete playerWithoutKilledBy.killedBy;
          await players.insertOne({
            targetId: tempPlayer.targetId,
            ...playerWithoutKilledBy,
          });
          await players.updateOne(
            { id: tempPlayer.id },
            { $set: { targetId: player.id } }
          );
          await players.updateOne(
            { id: player.killedBy },
            { $inc: { kills: -1 } }
          );
          reply.send(`Successfully revived player ${playerId}.`);
        } else {
          reply.internalServerError("Couldn't assign a new target to player");
        }
      } else {
        reply.forbidden("Provided playerId is incorrect");
      }
    }
  );

  fastify.post<{
    Body: { db: number; query: string; type: number; password: string };
  }>(
    "/game/searchPlayer",
    {
      schema: {
        body: {
          type: "object",
          required: ["db", "query", "type", "password"],
          properties: {
            db: { type: "number" },
            query: { type: "string" },
            type: { type: "number" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!server.mongo.db) return reply.internalServerError();
      const { db, query, type, password: pass } = request.body;
      if (pass !== "DarlingDialThatNumber777%") reply.unauthorized();
      if (db !== 0 && db !== 1) reply.badRequest();
      if (type > 3) reply.badRequest();
      const deadPlayers = server.mongo.db.collection("deadPlayers");
      let field = ["email", "firstName", "lastName", "targetId", "id"][type];
      const findQuery: any = {};
      findQuery[field] = query;
      const res =
        db === 0
          ? await players.find(findQuery).toArray()
          : await deadPlayers.find(findQuery).toArray();
      reply.send(res);
    }
  );

  fastify.post<{
    Body: { paused: boolean; message?: string; password: string };
  }>(
    "/game/changeGameStatus",
    {
      schema: {
        body: {
          type: "object",
          required: ["paused", "password"],
          properties: {
            paused: { type: "boolean" },
            message: { type: "string" },
            password: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      if (!server.mongo.db) return reply.internalServerError();
      const { paused, message, password: pass } = request.body;
      if (pass !== "DarlingDialThatNumber777%") reply.unauthorized();
      const activatedStops = server.mongo.db.collection("activatedStops");
      await activatedStops.updateMany(
        {},
        { $set: { kill: paused, killStopMsg: paused ? message : undefined } }
      );
      reply.send("ok");
    }
  );

  done();
};

server.register(playerRoutes);
server.register(statsRoutes);
server.register(gameRoutes);

server.addHook("onRequest", async (request, reply) => {
  if (typeof request.headers["x-api-key"] !== "string") reply.badRequest();
  if (request.headers["x-api-key"] !== process.env.API_KEY)
    reply.unauthorized();
});

server.listen({ port: port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.log(err);
    logger.error(err);
    process.exit(1);
  }
  logger.info(`Server listening at ${address}!`);
});
