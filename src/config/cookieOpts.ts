import { CookieSerializeOptions } from "@fastify/cookie";
const env = process.env.NODE_ENV;

export const COOKIE_OPTS: CookieSerializeOptions = {
  path: "/",
  secure: true,
  httpOnly: true,
  sameSite: "lax",
  signed: true,
  maxAge: 60 * 60 * 24,
};
