import winston, { transports } from "winston";

const logLevels = {
  fatal: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
  trace: 5,
};

const alignColorsAndTime = winston.format.combine(
  winston.format.colorize({
    all: true,
  }),
  winston.format.label({
    label: "[LOGGER]",
  }),
  winston.format.timestamp({
    format: "YY-MM-DD HH:mm:ss",
  }),
  winston.format.printf((info) => ` [${info.level}] ${info.timestamp} : ${info.message}`)
);

const logger = winston.createLogger({
  level: "info",
  levels: logLevels,
  transports: [
    new transports.Console({
      format: winston.format.combine(winston.format.colorize(), alignColorsAndTime),
    }),
  ],
});

export default logger;
