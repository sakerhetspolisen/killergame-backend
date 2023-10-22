import { FastifyPluginCallback, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import FormData from "form-data";
import Mailgun from "mailgun.js";
import { EMAIL_SENDER_ADDRESS, EMAIL_SENDER_NAME } from "../config/config";

const emailPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  const mailgun = new Mailgun(FormData);
  const mgClient = mailgun.client({
    username: process.env.MAILGUN_USERNAME!,
    key: process.env.MAILGUN_API_KEY!,
  });

  fastify.decorate("sendPlayerWelcomeEmail", sendPlayerWelcomeEmail);

  async function sendPlayerWelcomeEmail(
    name: string,
    id: string,
    email: string
  ) {
    const emailComposeData = {
      from: `${EMAIL_SENDER_NAME} <${EMAIL_SENDER_ADDRESS}>`,
      to: `${name} <${email}>`,
      subject: `Du är redo för Killergame 2023.`,
      template: "name-of-the-template-you-made-in-mailgun-web-portal",
      "t:variables": JSON.stringify({
        name,
        id,
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
