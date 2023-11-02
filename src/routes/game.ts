import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";

export default function game(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const game = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_GAME!
  );

  fastify.get("/getSettings", {}, async (request, reply) => {
    const settingsDoc = await game.findOne(
      { type: "settings" },
      { projection: { _id: 0, type: 0 } }
    );

    if (!settingsDoc) {
      return reply.internalServerError("Couldn't find settings");
    }

    return settingsDoc;
  });

  done();
}
