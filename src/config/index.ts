import { config as loadEnvironmentFile } from "dotenv";
import { z } from "zod";

loadEnvironmentFile();

const runtimeConfigSchema = z.object({
  SIDECAR_SERVICE_NAME: z
    .string()
    .trim()
    .min(1, "SIDECAR_SERVICE_NAME must be set to a non-empty value"),
  NODE_ENV: z.enum(["development", "test", "production"]),
  SIDECAR_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
});

export type NodeEnvironment = z.infer<typeof runtimeConfigSchema>["NODE_ENV"];
export type LogLevel = z.infer<typeof runtimeConfigSchema>["SIDECAR_LOG_LEVEL"];

export interface RuntimeConfig {
  serviceName: string;
  nodeEnv: NodeEnvironment;
  logLevel: LogLevel;
}

export class ConfigurationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super("Invalid runtime configuration.");
    this.name = "ConfigurationError";
    this.issues = issues;
  }
}

export const loadConfig = (): RuntimeConfig => {
  const parsedConfig = runtimeConfigSchema.safeParse(process.env);

  if (!parsedConfig.success) {
    const issues = parsedConfig.error.issues.map((issue) => {
      const path = issue.path.join(".") || "environment";
      return `${path}: ${issue.message}`;
    });

    throw new ConfigurationError(issues);
  }

  return {
    serviceName: parsedConfig.data.SIDECAR_SERVICE_NAME,
    nodeEnv: parsedConfig.data.NODE_ENV,
    logLevel: parsedConfig.data.SIDECAR_LOG_LEVEL,
  };
};
