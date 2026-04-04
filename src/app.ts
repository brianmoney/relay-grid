import { loadConfig } from "./config";
import { createService } from "./services/service";
import { createLogger, withLogContext } from "./utils/logger";

export interface BootstrappedApp {
  stop: () => Promise<void>;
}

export const bootstrap = async (): Promise<BootstrappedApp> => {
  const config = loadConfig();
  const logger = createLogger(config);
  const bootstrapLogger = withLogContext(logger, { stage: "bootstrap" });
  const service = createService({ config, logger });

  bootstrapLogger.info({ event: "startup_begin" }, "Starting sidecar service");
  bootstrapLogger.info(
    {
      event: "dispatch_mode_selected",
      dispatchMode: config.dispatch.mode,
      openDispatchEndpointPath: config.dispatch.openDispatchHttp.endpointPath,
      openDispatchBaseUrl: config.dispatch.mode === "opendispatch-http"
        ? config.dispatch.openDispatchHttp.baseUrl
        : undefined,
    },
    "Selected transcript dispatch mode"
  );
  await service.start();
  bootstrapLogger.info(
    { event: "startup_complete" },
    "Sidecar service ready for follow-on adapter registration"
  );

  return {
    stop: async () => {
      bootstrapLogger.info({ event: "shutdown_begin" }, "Stopping sidecar service");
      await service.stop();
      bootstrapLogger.info({ event: "shutdown_complete" }, "Sidecar service stopped");
    },
  };
};
