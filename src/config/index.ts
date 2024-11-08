export const JWT_PLAYER_COOKIE_NAME: string = "token";
export const JWT_ADMIN_COOKIE_NAME: string = "admin-token";
export const EMAIL_SENDER_NAME = "Killergamekommittén";
export const EMAIL_SENDER_ADDRESS = `noreply@${process.env.MAILGUN_DOMAIN!}`;
export const ALLOWED_GRADES = [
  "NA1A",
  "NA1B",
  "NA1C",
  "EK1A",
  "EK1B",
  "EK1C",
  "SA1",
  "NA2A",
  "NA2B",
  "NA2C",
  "EK2A",
  "EK2B",
  "EK2C",
  "SA2",
  "NA3A",
  "NA3B",
  "NA3C",
  "EK3A",
  "EK3B",
  "EK3C",
  "SA3",
];
export const STATS_POLLING_INTERVAL_IN_SECONDS = 60;
