import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { IDBPlayer, IPlayer, PlayerID } from "../interfaces/player.interface";
import shuffleArray from "../utils/shuffleArray";

export default function admin(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  fastify.addHook("onRequest", fastify.adminAuthorize);
  //fastify.addHook("onRequest", fastify.csrfProtection);

  if (!fastify.mongo.db) return fastify.close();
  const players = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_PLAYERS!
  );

  // Endpoint for randomizing all player targets. On each request,
  // this endpoint fetches all users and updates each and every one
  // with a new target, so be aware that it is resource-intensive.
  fastify.get("/game/randTargets", {}, async (request, reply) => {
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
  fastify.get("/game/debug", {}, async (request, reply) => {
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

  // Endpoint to get a player in the players database.
  // Uses the id as a unique identifier.
  //
  // TODO: Expand this so that players can be searched
  //       by email as well.
  //
  fastify.get<{ Querystring: Pick<IPlayer, "id"> }>(
    "/game/getPlayer",
    {
      schema: {
        querystring: {
          type: "object",
          properties: {
            id: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const idQuery = request.query.id;
      const player = await players.findOne({ id: idQuery });
      if (!player) {
        return reply.notFound("Player not found");
      }
      return player;
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
  done();
}
