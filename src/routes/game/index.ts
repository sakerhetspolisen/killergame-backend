import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import Game from "../../models/game";

export default function game(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const game = new Game(
    fastify.mongo.db.collection(process.env.MONGODB_DB_TABLE_NAME_GAME!)
  );

  fastify.get("/getSettings", {}, async (request, reply) => {
    return await game.getSettings();
  });

  done();
}
