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
import fastifyWebsocket from "@fastify/websocket";
import { readFileSync } from "fs";
import path from "path";
import { COOKIE_OPTS } from "./config/cookieOpts";
import fastifyHelmet from "@fastify/helmet";
import mailService from "./plugins/mailService";
import game from "./routes/game";
import fastifyCaching from "@fastify/caching";

/**
 * Type declarations that extend fastify. These can't be moved to a
 * *.d.ts file because they need to be read after the dependencies
 * are imported
 */
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
    sendPlayerWelcomeEmail: (name: string, id: string, email: string) => void;
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
      | { id: string; name: string; grade: string; email: string }
      | { id: string; username: string }; // payload type is used for signing and verifying
    user:
      | {
          id: string;
          name: string;
          grade: string;
          email: string;
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
  http2: true,
  https: {
    key:
      process.env.NODE_ENV === "production"
        ? readFileSync(`${process.env.SSL_CERT_DIR!}/privkey.pem`)
        : undefined,
    cert:
      process.env.NODE_ENV === "production"
        ? readFileSync(`${process.env.SSL_CERT_DIR!}/fullchain.pem`)
        : undefined,
  },
});
const port = Number(process.env.PORT) || 443;

/**
 * Adds functionality to reply with HTTP status codes with a constant
 * response schema.
 */
server.register(fastifySensible);

/**
 * CORS settings for the API disables use of it on other domains than
 * the ones specified in "origin". Additionally, we here disable all
 * other types of requests than GET, POST and PUT.
 */
server.register(fastifyCORS, {
  origin: "http://localhost:3000",
  methods: ["GET", "POST", "PUT"],
  credentials: true,
});

/**
 * To attempt to minimize the work-load of the server, we here define
 * a rate limit of "max" requests per "timeWindow"
 */

// TODO: Enable rate-limiting
// server.register(fastifyRateLimit, {
//   max: 84,
//   timeWindow: "1 minute",
// });

/**
 * Adds import security HTTP headers to all replies
 */
server.register(fastifyHelmet);

/**
 * Enables us to work with cache headers so that we prevent slow
 * updates on the website.
 */
server.register(fastifyCaching, {
  privacy: fastifyCaching.privacy.NOCACHE,
});

/**
 * Connector to MongoDB database
 */
server.register(fastifyMongodb, {
  url: "mongodb://mongodb",
  database: process.env.MONGODB_DB_NAME!,
  authSource: "admin",
  auth: {
    username: process.env.MONGODB_ADMIN!,
    password: process.env.MONGODB_ADMIN_PWD!,
  },
});

/**
 * We use @fastify/cookie to be able to set and delete cookies in
 * replies. This is manily for authentication purposes, but could also
 * be used to store other values. We sign all cookies with a secret
 */
server.register(fastifyCookie, {
  secret: readFileSync(path.join(__dirname, "..", "cookieSecret.key")),
});

/**
 * We enable CSRF-protection with @fastify/csrf-protection, which
 * seamlessly works together with @fastify/cookie
 *
 * BUG: csrfOpts.hmacKey has to be passed in order for TS to not throw
 *      a type error when specifying @fastify/cookie as the
 *      "sessionPlugin"
 *
 * TODO: Add onRequest: fastify.csrfProtection, to all endpoints that
 *       need protection.
 */
server.register(fastifyCsrfProtection, {
  cookieOpts: COOKIE_OPTS,
  sessionPlugin: "@fastify/cookie",
  csrfOpts: {
    hmacKey: readFileSync(path.join(__dirname, "..", "csrfHMAC.key")),
  },
});

/**
 * Websockets are used to serve stats polled from the stats-collection
 */
server.register(fastifyWebsocket, {
  options: {
    maxPayload: 1000,
  },
});

/**
 * Here we register the pugins we've built ourselves
 */
server.register(adminAuth);
server.register(playerAuth);
server.register(mailService);

/**
 * Registration of routes defined in other files
 */
server.register(game);
server.register(player, { prefix: "/player" });
server.register(stats, { prefix: "/stats" });
server.register(admin, { prefix: "/admin" });

server.listen({ port: port, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
