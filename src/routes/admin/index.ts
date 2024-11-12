import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import {
  IDBPlayer,
  IPlayer,
  PlayerID,
  TargetPlayer,
} from "../../interfaces/player.interface";
import shuffleArray from "../../utils/shuffleArray";
import Players from "../../models/players";
import Game from "../../models/game";

export default function admin(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  fastify.addHook("onRequest", fastify.adminAuthorize);

  if (!fastify.mongo.db) return fastify.close();
  const players = new Players(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_PLAYERS!)
  );
  const game = new Game(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_GAME!)
  );

  // Endpoint for randomizing all player targets. On each request,
  // this endpoint fetches all users and updates each and every one
  // with a new target, so be aware that it is resource-intensive.
  fastify.get("/game/randTargets", async (request, reply) => {
    await players.randomizeAllTargets();
    reply.send("Successfully randomized all targets");
  });

  // Endpoint for debugging the game. These computations are resource-intensive
  // because all players are fetched from the database and compared.
  fastify.get("/game/debug", async (request, reply) => {
    // Get an array of all players, but only include _id, id, target and
    // email in the object. These are the only values we'll need when
    // debugging
    const allPlayers = await players.db
      .find(
        { alive: true },
        { projection: { _id: 1, id: 1, target: 1, email: 1 } }
      )
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
        player = await players.getPlayerById(id);
      } else if (email) {
        player = await players.getPlayerByEmail(email);
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
   * Endpoint to delete a player in the players database.
   * Uses the id or email as a unique identifier.
   */
  fastify.get<{ Querystring: Partial<Pick<IPlayer, "id" | "email">> }>(
    "/game/deletePlayer",
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
      var targetOfDeletedPlayer;
      if (id) {
        targetOfDeletedPlayer = (await players.getPlayerById(id))?.target;
        await players.perDeletePlayerById(id);
      } else if (email) {
        targetOfDeletedPlayer = (await players.getPlayerByEmail(email))?.target;
        await players.perDeletePlayerByEmail(email);
      } else {
        return reply.badRequest("Did not provide any query arguments");
      }

      await players.db.updateOne(
        { "target.id": id },
        { $set: { target: targetOfDeletedPlayer } }
      );

      return reply.send("Successfully deleted player");
    }
  );

  /**
   * Endpoint to get all players currently stored in the database.
   */
  fastify.get<{ Querystring: { limit?: number } }>(
    "/game/getAllPlayers",
    async (request, reply) => {
      return await players.getAllPlayers();
    }
  );

  /**
   * Endpoint to update existing players in the players database.
   * Since we choose to have several values to unique identify a
   * a player, "_id", "id", and "email" will throw an error if
   * included in the request.
   */
  fastify.put<{
    Body: Pick<IDBPlayer, "name" | "grade" | "kills" | "alive">;
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
            alive: { type: "boolean" },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { name, grade, kills, alive } = request.body || {};

      // Validate ID presence
      if (!id) {
        return reply.badRequest("No id provided");
      }

      // Fetch player data
      const player = await players.getPlayerById(id, [], []);
      if (!player) {
        return reply.notFound("Player not found");
      }

      // Prepare update object
      const updateData: Partial<IDBPlayer> = {};

      // Update fields if they are provided in the request body
      if (typeof name === "string") updateData.name = name;
      if (typeof grade === "string") updateData.grade = grade;
      if (typeof kills === "number") updateData.kills = kills;
      if (typeof alive === "boolean") updateData.alive = alive;

      // Special handling for changes in kills
      if (kills !== undefined) {
        if (kills > player.kills) {
          // Update latest kill time
          updateData.latestKillTime = new Date().getTime();
        } else if (kills === 0) {
          // Reset fastest kill
          updateData.fastestKill = Number.MAX_SAFE_INTEGER;
        }
      }

      // Special handling for changes in alive status
      if (alive !== undefined && alive !== player.alive) {
        if (alive === true) {
          // Player is reborn

          // We get first player, set their target to us,
          // then update our target with their old target
          const newTarget: TargetPlayer | null = await players.db
            .findOneAndUpdate(
              {},
              {
                $set: {
                  target: {
                    _id: player._id,
                    name: player.name,
                    grade: player.grade,
                    id: player.id,
                  },
                },
              },
              { projection: { target: 1, _id: 0 } }
            )
            .then((p) => p?.target);
          if (newTarget) updateData.target = newTarget;
        } else {
          // Player is killed
          const target = await players.eliminateTargetAndGetNextTarget(
            "000000",
            player.id
          );
          await players.db.updateOne(
            { "target.id": player.id },
            { $set: { target } }
          );
        }
      }

      try {
        return await players.db.findOneAndUpdate(
          { id },
          { $set: updateData },
          { returnDocument: "after" }
        );
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
    await players.db.deleteMany({});

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
        await game.db.updateOne(
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

  /**
   * Endpoint for opening and closing signup
   */
  fastify.post<{ Body: { isClosed: boolean } }>(
    "/game/setSignupClosed",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            isClosed: { type: "boolean" },
          },
          required: ["isClosed"],
        },
      },
    },
    async (request, reply) => {
      if (!request.body || typeof request.body.isClosed !== "boolean") {
        return reply.badRequest("Body should include boolean isClosed");
      }
      const { isClosed } = request.body;
      try {
        /**
         * Setting upsert to true creates a new document with the supplied
         * data if it doesn't exist
         */
        await game.db.updateOne(
          { type: "settings" },
          { $set: { signupIsClosed: isClosed } },
          { upsert: true }
        );
      } catch (error) {
        return reply.internalServerError(
          isClosed
            ? "There was an error closing the signup"
            : "There was an error opening the signup"
        );
      }
      return { isClosed };
    }
  );

  /**
   * Endpoint for pausing and unpausing the game
   */
  fastify.post<{ Body: { killValue: number } }>(
    "/game/setKillValue",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            killValue: { type: "integer" },
          },
          required: ["killValue"],
        },
      },
    },
    async (request, reply) => {
      if (!request.body || typeof request.body.killValue !== "number") {
        return reply.badRequest("Body should include integer killValue");
      }
      const { killValue } = request.body;
      try {
        /**
         * Setting upsert to true creates a new document with the supplied
         * data if it doesn't exist
         */
        await game.db.updateOne(
          { type: "settings" },
          { $set: { killValue } },
          { upsert: true }
        );
      } catch (error) {
        return reply.internalServerError(
          "There was an error setting a new kill value"
        );
      }
      return { killValue };
    }
  );

  done();
}
