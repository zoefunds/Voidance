import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { pool } from "./db/pool.js";
import { createApp } from "./app.js";
import { startSyncLoop } from "./services/sync.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "voidance-backend listening");
});

const syncHandle = startSyncLoop(env.SYNC_INTERVAL_MS);

// --- 24/7 resilience -------------------------------------------------------
// The process must survive unexpected errors rather than exit — Fly.io will
// restart a crashed machine, but every restart drops in-flight connections
// and the sync cursor. Logging-and-continuing keeps uptime as close to 100%
// as a single-process Node service can get; combined with fly.toml's
// `min_machines_running >= 1` + auto-restart, this is what "never dies"
// means in practice for this service.
process.on("uncaughtException", (err) => {
  logger.error({ err }, "uncaughtException — continuing");
});
process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "unhandledRejection — continuing");
});

function shutdown(signal: string) {
  logger.info({ signal }, "shutting down gracefully");
  clearInterval(syncHandle);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  // Force-exit if graceful shutdown hangs longer than 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
