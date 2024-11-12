import fp from "fastify-plugin";
import { FastifyInstance } from "fastify";

export default fp(async (fastify: FastifyInstance) => {
  const routes = new Set();

  fastify.addHook("onRoute", (routeOptions) => {
    if (routeOptions.routePath !== "" && routeOptions.routePath !== "/*") {
      routes.add(routeOptions.routePath);
    }
  });

  fastify.addHook("onReady", () => {
    [...routes].forEach((route) => {
      console.log(`  '${route}',`);
    });
  });
});
