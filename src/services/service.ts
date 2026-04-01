import type { RuntimeConfig } from "../config";
import type { LifecycleService } from "../types/service";
import { withLogContext, type AppLogger } from "../utils/logger";

interface ServiceDependencies {
  config: RuntimeConfig;
  logger: AppLogger;
}

export const createService = ({ config, logger }: ServiceDependencies): LifecycleService => {
  const serviceLogger = withLogContext(logger, { stage: "service" });
  let started = false;

  return {
    async start() {
      if (started) {
        return;
      }

      started = true;
      serviceLogger.info(
        {
          event: "service_initialized",
          serviceName: config.serviceName,
        },
        "Base sidecar service initialized"
      );
    },

    async stop() {
      if (!started) {
        return;
      }

      started = false;
      serviceLogger.info({ event: "service_stopped" }, "Base sidecar service stopped");
    },
  };
};
