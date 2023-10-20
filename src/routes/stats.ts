import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { IDBStats } from "../interfaces/stats.interface";

export default function stats(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const statsChangeStream = fastify.mongo.db
    .collection(process.env.MONGODB_DB_TABLE_NAME_STATS!)
    .watch();
  fastify.register(fastifyWebsocket);
  fastify.get("/", { websocket: true }, async (connection, req) => {
    statsChangeStream.on("change", (next) => {
      if (next.operationType === "update") {
        connection.emit("hello");
      }
    });
  });
  done();
}
