import * as dotenv from "dotenv";
dotenv.config();
import fastify from "fastify";
import fastifySensible from "@fastify/sensible";
import fastifyCORS from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyMongodb from "@fastify/mongodb";
import player from "./routes/player";
import stats from "./routes/stats";
import admin from "./routes/admin";
import adminAuth from "./plugins/adminAuth";
import fastifyCookie from "@fastify/cookie";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import playerAuth from "./plugins/playerAuth";

declare module "fastify" {
  interface FastifyInstance {
    adminAuthorize: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => void | Promise<void>;
    playerAuthorize: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => void | Promise<void>;
  }

  interface FastifyRequest {
    adminJWTVerify: FastifyRequest["jwtVerify"];
    playerJWTVerify: FastifyRequest["jwtVerify"];
  }

  interface FastifyReply {
    adminJWTSign: FastifyReply["jwtSign"];
    playerJWTSign: FastifyReply["jwtSign"];
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload:
      | { id: string; name: string; grade: string }
      | { id: string; username: string }; // payload type is used for signing and verifying
    user:
      | {
          id: string;
          name: string;
          grade: string;
        }
      | {
          id: string;
          username: string;
        }; // user type is return type of `request.user` object
  }
}

const server = fastify({
  logger: true,
  ignoreTrailingSlash: true,
});
const port = Number(process.env.PORT) || 9001;

server.register(fastifySensible);

server.register(fastifyCORS, {
  origin: ["127.0.0.1", "killergameprocce.se"],
  methods: ["GET", "POST", "PUT"],
});

server.register(fastifyRateLimit, {
  max: 84,
  timeWindow: "1 minute",
});

server.register(fastifyMongodb, {
  url: "mongodb://mongodb",
  database: process.env.MONGODB_DB_NAME!,
  authSource: "admin",
  auth: {
    username: process.env.MONGODB_ADMIN!,
    password: process.env.MONGODB_ADMIN_PWD!,
  },
});

server.register(fastifyCookie);
server.register(fastifyCsrfProtection);

server.register(adminAuth);
server.register(playerAuth);

server.register(player, { prefix: "/player" });
server.register(stats, { prefix: "/stats" });
server.register(admin, { prefix: "/admin" });

server.listen({ port: port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    console.log(err);
    process.exit(1);
  }
  console.log(`Server listening at ${address}!`);
});
