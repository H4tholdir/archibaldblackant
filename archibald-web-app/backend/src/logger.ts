import winston from "winston";
import { config } from "./config";

let lastLogTs = Date.now();
let logSeq = 0;

const addTiming = winston.format((info) => {
  const now = Date.now();
  const deltaMs = now - lastLogTs;
  lastLogTs = now;
  logSeq += 1;
  info.logSeq = logSeq;
  info.deltaMs = deltaMs;
  return info;
});

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    addTiming(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json(),
  ),
  defaultMeta: { service: "archibald-backend" },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? JSON.stringify(meta, null, 2)
            : "";
          return `${timestamp} [${level}]: ${message} ${metaStr}`;
        }),
      ),
    }),
    new winston.transports.File({ filename: "logs/error.log", level: "error" }),
    new winston.transports.File({ filename: "logs/combined.log" }),
  ],
});
