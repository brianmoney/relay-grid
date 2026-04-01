import pino, { type Logger } from "pino";

import { ConfigurationError, type RuntimeConfig } from "../config";
import type { ProcessingLogContext } from "../types/logging";

export type AppLogger = Logger;

interface FatalErrorPayload {
  level: string;
  time: string;
  stage: string;
  event: string;
  errorName: string;
  errorMessage: string;
  issues?: string[];
}

export const createLogger = (config: RuntimeConfig): AppLogger => {
  return pino({
    level: config.logLevel,
    base: {
      service: config.serviceName,
      environment: config.nodeEnv,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
};

export const withLogContext = (logger: AppLogger, context: ProcessingLogContext): AppLogger => {
  return logger.child(context);
};

const buildFatalErrorPayload = (stage: string, event: string, error: unknown): FatalErrorPayload => {
  if (error instanceof ConfigurationError) {
    return {
      level: "error",
      time: new Date().toISOString(),
      stage,
      event,
      errorName: error.name,
      errorMessage: error.message,
      issues: error.issues,
    };
  }

  if (error instanceof Error) {
    return {
      level: "error",
      time: new Date().toISOString(),
      stage,
      event,
      errorName: error.name,
      errorMessage: error.message,
    };
  }

  return {
    level: "error",
    time: new Date().toISOString(),
    stage,
    event,
    errorName: "UnknownError",
    errorMessage: "An unknown fatal error occurred.",
  };
};

export const writeFatalError = (stage: string, event: string, error: unknown): void => {
  const payload = buildFatalErrorPayload(stage, event, error);
  process.stderr.write(`${JSON.stringify(payload)}\n`);
};
