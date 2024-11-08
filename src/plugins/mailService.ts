import { FastifyPluginCallback } from "fastify";
import fp from "fastify-plugin";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { EMAIL_SENDER_ADDRESS, EMAIL_SENDER_NAME } from "../config";

const emailPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  const mailgun = new Mailgun(FormData);
  const mgClient = mailgun.client({
    username: "api",
    key: process.env.MAILGUN_API_KEY!,
    url: "https://api.eu.mailgun.net",
  });

  fastify.decorate("sendPlayerWelcomeEmail", sendPlayerWelcomeEmail);

  async function sendPlayerWelcomeEmail(
    name: string,
    id: string,
    email: string
  ) {
    const emailComposeData = {
      from: `${EMAIL_SENDER_NAME} <${EMAIL_SENDER_ADDRESS}>`,
      to: `${name} <${
        email.includes(process.env.MAILGUN_DEV_TEST_ADDRESS!)
          ? process.env.MAILGUN_DEV_TEST_ADDRESS!
          : email
      }>`,
      subject: `Du är redo för Killergame 2024 \uD83E\uDDE3\uD83E\uDEA8`,
      template: "player welcome email",
      "h:X-Mailgun-Variables": JSON.stringify({
        name,
        id: id.slice(0, 3) + " " + id.slice(3, 6),
      }),
    };
    try {
      const msgSend = await mgClient.messages.create(
        process.env.MAILGUN_DOMAIN!,
        emailComposeData
      );
      fastify.log.info(`MAILGUN.JS SEND to ${email}: ${msgSend.status}`);
    } catch (error) {
      fastify.log.error(`MAILGUN.JS SEND ERROR: ${error}`);
    }
  }
  done();
};

export default fp(emailPlugin, { name: "email" });
