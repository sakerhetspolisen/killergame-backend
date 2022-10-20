import Mailgun from "mailgun.js";
import FormData from "form-data";
const DOMAIN = "sandbox70b8b52f49924c038ac0745b32265b8e.mailgun.org";
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  key: "968e7dc1055c9c1970929a5e4c1ee633-d117dd33-d17d0bb6",
  username: "api",
});

var email = "karlsellergren@protonmail.com";
var firstName = "Karl";
var lastName = "Sellergren";
var id = "637 273";

const data = {
  from: "Killergame <postmaster@sandbox70b8b52f49924c038ac0745b32265b8e.mailgun.org>",
  to: email,
  subject: `${firstName}, här är din inloggningskod.`,
  template: "player_id",
  "h:X-Mailgun-Variables": { firstName, playerId: id },
};
try {
  const res = mg.messages.create(DOMAIN, data);
} catch (err) {
  console.log(err);
}
