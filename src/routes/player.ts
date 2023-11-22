import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { IPlayer } from "../interfaces/player.interface";

export default function player(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const players = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_PLAYERS!
  );
  const game = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_GAME!
  );
  fastify.addHook("onRequest", fastify.playerAuthorize);

  fastify.post<{ Body: Pick<IPlayer, "id"> }>(
    "/killTarget",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 6, minLength: 6 },
          },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      if (!request.body) {
        return reply.badRequest("Body is required");
      }

      // TODO: Querying the game-db on every kill request can be improved
      const gameSettings = await game.findOne(
        { type: "settings" },
        { projection: { isPaused: 1, killValue: 1 } }
      );
      if (
        !gameSettings ||
        gameSettings.isPaused === true ||
        gameSettings.isPaused === undefined
      ) {
        return reply.serviceUnavailable("Game is currently paused");
      }

      const player = await players.findOne(
        { id: request.user.id },
        { projection: { target: 1, latestKillTime: 1, alive: 1 } }
      );
      /**
       * Initial player and request checks
       */
      if (!player) {
        return reply.internalServerError("Couldn't find logged in player");
      }
      if (!player.alive) {
        return reply.internalServerError("Player is not alive");
      }
      if (!player.target) {
        return reply.internalServerError("Player has no target");
      }
      if (request.body.id !== player.target.id) {
        return reply.badRequest("Target ID is incorrect");
      }

      /**
       * Attempt to find target in database, mainly to update the 'alive'
       * field and to make the logged-in player inherit the targets target.
       */
      const target = await players.findOneAndUpdate(
        { id: player.target.id },
        {
          $set: {
            target: null,
            alive: false,
            killedBy: request.user.id,
            isTarget: false,
          },
        },
        { projection: { target: 1 } }
      );
      if (!target.value) {
        return reply.internalServerError("Couldn't find target");
      }

      const currentTime = new Date().getTime();
      const killTime = currentTime - player.latestKillTime;
      const nOfKillsToIncrement = gameSettings.killValue || 1;
      await players.updateOne(
        { id: request.user.id },
        {
          $set: {
            target: target.value.target,
            latestKillTime: currentTime,
          },
          $min: {
            fastestKill: killTime,
          },
          $inc: { kills: nOfKillsToIncrement },
        }
      );
      return target.value
        ? {
            target: {
              name: target.value.target.name,
              grade: target.value.target.grade,
            },
          }
        : {};
    }
  );

  done();
}
