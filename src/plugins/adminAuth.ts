import fastifyJwt from "@fastify/jwt";
import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { IAdmin } from "../interfaces/admin.interface";
import bcrypt from "bcrypt";
import { readFileSync } from "fs";
import path from "path";
import { JWT_ADMIN_COOKIE_NAME } from "../config";
import { COOKIE_OPTS } from "../config/cookieOpts";

const adminAuthPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  if (!fastify.mongo.db) return fastify.close();
  const admins = fastify.mongo.db.collection(
    process.env.MONGODB_DB_TABLE_NAME_ADMINS!
  );

  fastify.register(fastifyJwt, {
    secret: readFileSync(
      path.join(__dirname, "..", "..", "jwtSecretAdmin.key")
    ),
    sign: {
      algorithm: "HS256",
      expiresIn: 3600, // 1 day
    },
    cookie: {
      cookieName: JWT_ADMIN_COOKIE_NAME,
      signed: true,
    },
    namespace: "admin",
    jwtVerify: "adminJWTVerify",
    jwtSign: "adminJWTSign",
  });

  fastify.decorate("adminAuthorize", authorize);

  fastify.post<{ Body: IAdmin }>(
    "/admin/addAdmin",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
          required: ["username", "password"],
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("Username and password is required");
      }
      if (!process.env.API_KEY) {
        return reply.internalServerError();
      }
      if (req.headers["x-api-key"] !== process.env.API_KEY!) {
        return reply.unauthorized();
      }
      try {
        const existingUser = await admins.findOne({
          username: req.body.username.toLowerCase(),
        });
        if (existingUser) {
          return reply.badRequest("User already exists");
        }
        const salt = await bcrypt.genSalt();
        admins.insertOne({
          username: req.body.username.toLowerCase(),
          pwdSalt: salt,
          pwd: await bcrypt.hash(req.body.password, salt),
          creationTime: new Date().getTime(),
        });
        reply.send("Successfully added an admin user");
      } catch (err) {
        reply.internalServerError(
          "There was an error signing up a new admin user"
        );
      }
    }
  );

  fastify.post<{ Body: IAdmin }>(
    "/admin/login",
    {
      schema: {
        body: {
          type: "object",
          properties: {
            username: { type: "string" },
            password: { type: "string" },
          },
          required: ["username", "password"],
        },
      },
    },
    async (req, reply) => {
      if (!req.body) {
        return reply.badRequest("Username and password is required");
      }
      var authorized = true;
      const user = await admins.findOne({ username: req.body.username });
      if (!user) {
        authorized = false;
        // If the username is incorrect, we still do a hash compare to
        // minimize the risk for timing attacks on usernames
        await bcrypt.compare(req.body.password, "hejs");
      } else {
        // if the username is correct though, we check the password and
        // give the unauthorized reply only if the password is incorrect
        const isMatch = await bcrypt.compare(req.body.password, user.pwd);
        if (!isMatch) {
          authorized = false;
        }
      }
      if (!authorized || !user) {
        return reply.unauthorized("Username or password is incorrect");
      }

      const token = await reply.adminJWTSign(
        {
          id: user._id.toString(),
          username: user.username,
        },
        {
          sign: {
            sub: user._id.toString(),
          },
        }
      );

      reply.setCookie(JWT_ADMIN_COOKIE_NAME, token, COOKIE_OPTS);
      reply.generateCsrf();

      return {
        username: user.username,
      };
    }
  );

  async function authorize(req: FastifyRequest, reply: FastifyReply) {
    try {
      await req.adminJWTVerify();
    } catch (e) {
      return reply.unauthorized("Token could not be verified");
    }
  }

  done();
};

export default fp(adminAuthPlugin, { name: "adminAuth" });
