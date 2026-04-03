import { bootstrap } from "./app";
import { writeFatalError } from "./utils/logger";

type ShutdownSignal = "SIGINT" | "SIGTERM";

const waitForShutdown = (stop: () => Promise<void>): Promise<void> => {
  return new Promise((resolve) => {
    let shuttingDown = false;
    const keepalive = setInterval(() => {
      // Keep the sidecar process alive until an explicit shutdown signal arrives.
    }, 1 << 30);

    const cleanup = (): void => {
      clearInterval(keepalive);
      process.off("SIGINT", handleSigint);
      process.off("SIGTERM", handleSigterm);
    };

    const shutdown = async (signal: ShutdownSignal): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;

      try {
        await stop();
      } catch (error) {
        process.exitCode = 1;
        writeFatalError("shutdown", "shutdown_failed", error);
      } finally {
        cleanup();
        resolve();
      }
    };

    const handleSigint = (): void => {
      void shutdown("SIGINT");
    };

    const handleSigterm = (): void => {
      void shutdown("SIGTERM");
    };

    process.once("SIGINT", handleSigint);
    process.once("SIGTERM", handleSigterm);
  });
};

const main = async (): Promise<void> => {
  const app = await bootstrap();

  await waitForShutdown(app.stop);
};

void main().catch((error) => {
  writeFatalError("bootstrap", "startup_failed", error);
  process.exit(1);
});
