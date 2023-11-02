import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { randomUUID } from "crypto";
import { STATS_POLLING_INTERVAL_IN_SECONDS } from "../config";

export default async function stats(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  if (!fastify.mongo.db) return fastify.close();
  const stats = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_STATS!
  );

  /**
   * To handle all WS clients asynchronously, we keep a Map of all clients and
   * iterate over them once we receive new data from the collection. This isn't
   * ideal, but works because we have a relatively small amount of clients.
   */
  const connectedClients = new Map();
  /**
   * Stats is stored in its own collection as the first and only document.
   * We omit the _id value.
   */
  var latestStatsObj = await stats.findOne({}, { projection: { _id: 0 } });

  setInterval(async () => {
    try {
      latestStatsObj = await stats.findOne({}, { projection: { _id: 0 } });
    } catch (error) {
      fastify.log.error("Error fetching data from MongoDB:", error);
    }
    try {
      for (const socket of connectedClients.values()) {
        socket.send(JSON.stringify(latestStatsObj));
      }
    } catch (error) {
      fastify.log.error("Error sending latest stats data to clients: ", error);
    }
  }, STATS_POLLING_INTERVAL_IN_SECONDS * 1000);

  fastify.get("/", { websocket: true }, async (connection, req) => {
    /***
     * We generate a "random-enough" client-id that will serve as a unique
     * identifier if we want to serve individual clients in the future
     */
    const clientID = randomUUID();
    connectedClients.set(clientID, connection.socket);
    fastify.log.info(`WS CONNECT: ${clientID}`);
    // We send an initial payload
    connection.socket.send(JSON.stringify(latestStatsObj));
    connection.socket.on("close", () => {
      connectedClients.delete(clientID);
      fastify.log.info(`WS DISCONNECT: ${clientID}`);
    });
  });

  done();
}
