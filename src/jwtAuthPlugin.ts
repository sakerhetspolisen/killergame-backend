import { FastifyPluginAsync } from "fastify";
import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { playerId: string };
    user: {
      playerId: string;
    };
  }
}

export interface myPluginFunc {
  (): any;
}
declare module "fastify" {
  interface FastifyInstance {
    authenticate: myPluginFunc;
  }
}
// define plugin using promises
const myPluginAsync: FastifyPluginAsync = async (fastify, options) => {
  fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET || "",
  });
  fastify.decorate("authenticate", async function (request: any, reply: any) {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.send(err);
    }
  });
};

// export plugin using fastify-plugin
export default fp(myPluginAsync);
