import { FastifyError, FastifyInstance, FastifyServerOptions } from "fastify";
import { IPlayer } from "../interfaces/player.interface";

export default function player(
  fastify: FastifyInstance,
  options: FastifyServerOptions,
  done: (err?: FastifyError) => void
) {
  fastify.post<{ Body: Pick<IPlayer, "id"> }>(
    "/killTarget",
    {},
    async (request, reply) => {
      //TODO
    }
  );
  done();
}
