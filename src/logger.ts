import winston from "winston";

const { combine, timestamp, json, errors, splat } = winston.format;

export function getLogger(): winston.Logger {
  return winston.createLogger({
    level: process.env.LOG_LEVEL ?? "info",
    format: combine(splat(), errors({ stack: true }), timestamp(), json()),
    transports: [new winston.transports.Console()],
  });
}
