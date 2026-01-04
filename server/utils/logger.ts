import winston from "winston";

const isProduction = process.env.NODE_ENV === "production";

const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: "HH:mm:ss" }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
    return `${timestamp} [${level}] ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: isProduction ? productionFormat : developmentFormat,
  defaultMeta: { service: "phantom" },
  transports: [
    new winston.transports.Console(),
  ],
});

export function createChildLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
