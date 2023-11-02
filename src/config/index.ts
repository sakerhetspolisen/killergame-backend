export const JWT_PLAYER_COOKIE_NAME: string = "token";
export const JWT_ADMIN_COOKIE_NAME: string = "admin-token";
export const EMAIL_SENDER_NAME = "Killergamekommittén";
export const EMAIL_SENDER_ADDRESS = `noreply@${process.env.MAILGUN_DOMAIN!}`;
export const ALLOWED_GRADES = [
  "NA3A",
  "NA3B",
  "NA3C",
  "SA3",
  "EK3A",
  "EK3B",
  "EK3C",
  "NA2A",
  "NA2B",
  "NA2C",
  "SA2",
  "EK2A",
  "EK2B",
  "EK2C",
  "NA1A",
  "NA1B",
  "NA1C",
  "SA1",
  "EK1A",
  "EK1B",
  "EK1C",
];
export const STATS_POLLING_INTERVAL_IN_SECONDS = 60;
