import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { IDBPlayer, IPlayer, PlayerID } from "../interfaces/player.interface";
import shuffleArray from "../utils/shuffleArray";

export default function admin(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  fastify.addHook("onRequest", fastify.adminAuthorize);

  if (!fastify.mongo.db) return fastify.close();
  const players = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_PLAYERS!
  );
  const game = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_GAME!
  );

  // Endpoint for randomizing all player targets. On each request,
  // this endpoint fetches all users and updates each and every one
  // with a new target, so be aware that it is resource-intensive.
  fastify.get("/game/randTargets", async (request, reply) => {
    const allPlayers = await players
      .find({}, { projection: { _id: 1, id: 1, name: 1, grade: 1 } })
      .toArray();
    const allPlayersShuffled = shuffleArray(allPlayers);
    const l = allPlayersShuffled.length;

    // Set the new target as the preceding player in the shuffled array
    // of players. The target of the first player in the array is set to
    // be the last player
    for (let i = 1; i <= l; i++) {
      const newTargetObj = {
        ...allPlayersShuffled[i - (1 % l)],
      };
      delete newTargetObj._id;
      allPlayersShuffled[i % l].target = newTargetObj;
    }

    // Update all players
    for (let { _id, target } of allPlayersShuffled) {
      await players.updateOne({ _id }, { $set: { target } });
    }
    reply.send("Successfully randomized all targets");
  });

  // Endpoint for debugging the game. These computations are resource-intensive
  // because all players are fetched from the database and compared.
  fastify.get("/game/debug", async (request, reply) => {
    // Get an array of all players, but only include _id, id, target and
    // email in the object. These are the only values we'll need when
    // debugging
    const allPlayers = await players
      .find({}, { projection: { _id: 1, id: 1, target: 1, email: 1 } })
      .toArray();

    // Define arrays for every check that is made
    let nonValidTargetIDs: Array<PlayerID> = [];
    let playerIDsThatAreNotTargets: Array<PlayerID> = [];
    let playerIDsThatAreTargetMultipleTimes: Array<PlayerID> = [];
    let playersWithoutTarget: Array<PlayerID> = [];
    let playerIDsThatAppearMultipleTimes: Record<PlayerID, Array<string>> = {};
    let emailsThatAppearMultipleTimes: Record<string, Array<PlayerID>> = {};

    // A nested loop enables us to compare player values to find duplicates
    for (let player of allPlayers) {
      let targetIsValid = false;
      let timesFoundAsTarget = 0;
      if (!player.target.id) playersWithoutTarget.push(player.id);
      for (let scndPlayer of allPlayers) {
        if (player.target.id === scndPlayer.id) targetIsValid = true;
        if (player.id === scndPlayer.target.id) timesFoundAsTarget += 1;
        if (player.id === scndPlayer.id && player._id !== scndPlayer._id) {
          if (playerIDsThatAppearMultipleTimes[player.id]) {
            playerIDsThatAppearMultipleTimes[player.id].push(
              player.email,
              scndPlayer.email
            );
          } else {
            playerIDsThatAppearMultipleTimes[player.id] = [
              player.email,
              scndPlayer.email,
            ];
          }
        }
        if (
          player.email === scndPlayer.email &&
          player._id !== scndPlayer._id
        ) {
          if (emailsThatAppearMultipleTimes[player.email]) {
            emailsThatAppearMultipleTimes[player.email].push(
              player.id,
              scndPlayer.id
            );
          } else {
            emailsThatAppearMultipleTimes[player.email] = [
              player.id,
              scndPlayer.id,
            ];
          }
        }
      }
      if (!targetIsValid && player.target.id !== null)
        nonValidTargetIDs.push(player.target.id);
      if (timesFoundAsTarget === 0) playerIDsThatAreNotTargets.push(player.id);
      if (timesFoundAsTarget > 1)
        playerIDsThatAreTargetMultipleTimes.push(player.id);
    }
    return {
      nonValidTargetIDs,
      playerIDsThatAreNotTargets,
      playerIDsThatAreTargetMultipleTimes,
      playersWithoutTarget,
      playerIDsThatAppearMultipleTimes,
      emailsThatAppearMultipleTimes,
    };
  });

  /**
   * Endpoint to get a player in the players database.
   * Uses the id or email as a unique identifier.
   */
  fastify.get<{ Querystring: Partial<Pick<IPlayer, "id" | "email">> }>(
    "/game/getPlayer",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id, email } = request.query;
      var player;
      if (id) {
        player = await players.findOne({ id });
      } else if (email) {
        player = await players.findOne({ email });
      } else {
        return reply.badRequest("Did not provide any query arguments");
      }
      if (!player) {
        return reply.notFound("Player not found");
      }
      return player;
    }
  );

  /**
   * Endpoint to get all players currently stored in the database.
   */
  fastify.get<{ Querystring: { limit?: number } }>(
    "/game/getAllPlayers",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer" },
          },
        },
      },
    },
    async (request, reply) => {
      const { limit } = request.query;
      var allPlayersCursor = players.find({});
      if (limit) {
        allPlayersCursor = allPlayersCursor.limit(limit);
      }
      return await allPlayersCursor.toArray();
    }
  );

  //
  // Endpoint to update existing players in the players database.
  // Since we choose to have several values to unique identify a
  // a player, "_id", "id", and "email" will throw an error if
  // included in the request.
  //
  fastify.put<{
    Body: Omit<IDBPlayer, "_id" | "id" | "email" | "creationTime">;
    Params: Pick<IPlayer, "id">;
  }>(
    "/game/player/:id",
    {
      schema: {
        params: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            name: { type: "string" },
            grade: { type: "string" },
            kills: { type: "integer" },
            fastestKill: { type: "integer" },
            latestKillTime: { type: "integer" },
            alive: { type: "boolean" },
            target: {
              type: "object",
              properties: {
                id: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      if (!request.body) {
        reply.badRequest("Missing body");
      }
      try {
        await players.findOneAndUpdate({ id: request.params.id }, request.body);
        reply.send("Successfully updated player");
      } catch (error) {
        reply.internalServerError("Couldn't update player");
      }
    }
  );

  /**
   * Endpoint for deleting all players
   */
  fastify.get("/game/reset", async (request, reply) => {
    if (!process.env.API_KEY) {
      return reply.internalServerError();
    }
    if (request.headers["x-api-key"] !== process.env.API_KEY!) {
      return reply.unauthorized();
    }
    await players.deleteMany({});

    reply.send("Successfully deleted all players");
  });

  /**
   * Endpoint for pausing and unpausing the game
   */
  fastify.post<{ Body: { isPaused: boolean } }>(
    "/game/setPaused",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            isPaused: { type: "boolean" },
          },
          required: ["isPaused"],
        },
      },
    },
    async (request, reply) => {
      if (!request.body || typeof request.body.isPaused !== "boolean") {
        return reply.badRequest("Body should include boolean isPaused");
      }
      const { isPaused } = request.body;
      try {
        /**
         * Setting upsert to true creates a new document with the supplied
         * data if it doesn't exist
         */
        await game.updateOne(
          { type: "settings" },
          { $set: { isPaused } },
          { upsert: true }
        );
      } catch (error) {
        return reply.internalServerError(
          isPaused
            ? "There was an error pausing the game"
            : "There was an error resuming the game"
        );
      }
      return { isPaused };
    }
  );

  done();
}
