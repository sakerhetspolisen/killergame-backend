import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { IPlayer } from "../../interfaces/player.interface";
import Players from "../../models/players";
import Game from "../../models/game";

export default function player(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const players = new Players(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_PLAYERS!)
  );

  const game = new Game(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_GAME!)
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
      // Check if required id exists
      const { id: targetId } = request.body;
      if (targetId == undefined) return reply.badRequest("ID is required");

      // Check game status
      const { isPaused, killValue } = await game.getSettings();
      if (isPaused) {
        return reply.serviceUnavailable("Game is currently paused");
      }

      // Fetch logged in player
      const player = await players.getPlayerById<
        "target" | "latestKillTime" | "alive"
      >(request.user.id, ["target", "latestKillTime", "alive"]);
      if (!player || !player.target) {
        return reply.internalServerError("Something went wrong");
      }

      // Check if player is alive
      if (!player.alive) {
        return reply.internalServerError("Player is not alive");
      }

      // Check if target id is correct
      if (targetId !== player.target.id) {
        return reply.badRequest("Target ID is incorrect");
      }

      // Get next target
      const newTarget = await players.eliminateTargetAndGetNextTarget(
        request.user.id,
        player.target.id
      );
      if (!newTarget) {
        return reply.internalServerError("Couldn't find target");
      }
      if (newTarget.id === request.user.id) {
        return {
          target: {
            name: "",
            grade: "",
          },
          hasWon: true,
        };
      }

      players.registerKillAndSetNewTarget(
        request.user.id,
        newTarget,
        player.latestKillTime,
        killValue
      );

      return {
        target: {
          name: newTarget.name,
          grade: newTarget.grade,
        },
      };
    }
  );

  done();
}
