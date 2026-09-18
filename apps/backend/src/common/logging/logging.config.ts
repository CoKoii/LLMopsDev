import { ConfigService } from "@nestjs/config";
import { utilities, type WinstonModuleOptions } from "nest-winston";
import winston from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import { Console } from "winston/lib/winston/transports";
import { getLoggingEnvironment } from "../config/env";

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.prettyPrint(),
);

const onlyLevel = (level: string) =>
  winston.format((info) => (info.level === level ? info : false))();

const createDailyTransport = (
  filename: string,
  level: string,
  format = fileFormat,
) =>
  new DailyRotateFile({
    dirname: "logs",
    filename,
    datePattern: "YYYY-MM-DD",
    zippedArchive: true,
    maxSize: "20m",
    maxFiles: "7d",
    level,
    format,
  });

const createLevelFileTransport = (filename: string, level: string) =>
  createDailyTransport(
    filename,
    level,
    winston.format.combine(onlyLevel(level), fileFormat),
  );

export const createWinstonLoggerOptions = (
  configService: ConfigService,
): WinstonModuleOptions => {
  const loggingEnvironment = getLoggingEnvironment(configService);
  const level = loggingEnvironment.level;
  const logEnabled = loggingEnvironment.enabled;

  return {
    level,
    transports: [
      new Console({
        level,
        format: winston.format.combine(
          winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
          utilities.format.nestLike(),
        ),
      }),
      ...(logEnabled
        ? [
            createDailyTransport("application-%DATE%.log", level),
            createLevelFileTransport("error-%DATE%.log", "error"),
            createLevelFileTransport("warning-%DATE%.log", "warn"),
          ]
        : []),
    ],
  };
};
