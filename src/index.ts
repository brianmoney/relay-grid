import { bootstrap } from "./app";
import { writeFatalError } from "./utils/logger";

type ShutdownSignal = "SIGINT" | "SIGTERM";

const registerShutdownHandlers = (stop: () => Promise<void>): void => {
  let shuttingDown = false;

  const shutdown = async (signal: ShutdownSignal): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    try {
      await stop();
      process.exit(0);
    } catch (error) {
      writeFatalError("shutdown", "shutdown_failed", error);
      process.exit(1);
    }
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }
};

const main = async (): Promise<void> => {
  const app = await bootstrap();

  registerShutdownHandlers(app.stop);

  await new Promise<void>(() => {
    // The sidecar stays alive until a shutdown signal is received.
  });
};

void main().catch((error) => {
  writeFatalError("bootstrap", "startup_failed", error);
  process.exit(1);
});
