import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { randomUUID } from "crypto";
import { WebSocket } from "ws";
import { STATS_POLLING_INTERVAL_IN_SECONDS } from "../config";

export default async function stats(
  fastify: FastifyInstance,
  options: FastifyServerOptions
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
  const connectedClients: Map<string, WebSocket> = new Map();
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
      for (const [clientID, socket] of connectedClients.entries()) {
        try {
          socket.send(JSON.stringify(latestStatsObj));
        } catch (error) {
          fastify.log.error(`Error sending data to client ${clientID}:`, error);
          connectedClients.delete(clientID);
        }
      }
    } catch (error) {
      fastify.log.error("Error sending latest stats data to clients: ", error);
    }
  }, STATS_POLLING_INTERVAL_IN_SECONDS * 1000);

  fastify.get("/", { websocket: true }, (socket: WebSocket, req) => {
    /***
     * We generate a "random-enough" client-id that will serve as a unique
     * identifier if we want to serve individual clients in the future
     */
    const clientID = randomUUID();
    connectedClients.set(clientID, socket);
    fastify.log.info(`WS CONNECT: ${clientID}`);
    // We send an initial payload
    socket.send(JSON.stringify(latestStatsObj));
    socket.on("close", () => {
      connectedClients.delete(clientID);
      fastify.log.info(`WS DISCONNECT: ${clientID}`);
    });
    socket.on("error", () => {
      connectedClients.delete(clientID);
      fastify.log.info(`WS ERROR: ${clientID}`);
    });
  });
}
