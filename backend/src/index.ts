import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { pool } from "./db/pool.js";
import { redis } from "./redis.js";
import { policiesRouter } from "./routes/policies.js";
import { walletsRouter } from "./routes/wallets.js";
import { statsRouter } from "./routes/stats.js";
import { startSyncLoop } from "./services/sync.js";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
  })
);
app.use(express.json({ limit: "256kb" }));
app.use(pinoHttp({ logger }));
// Redis-backed store when available so limits hold correctly across process
// restarts and any future multi-machine scale-out; falls back to the
// in-memory store (single-instance only) when REDIS_URL is unset.
const redisClient = redis;
const rateLimitStore = redisClient
  ? new RedisStore({
      sendCommand: (command: string, ...args: string[]) => redisClient.call(command, ...args) as Promise<any>,
    })
  : undefined;

app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    store: rateLimitStore,
  })
);

// Fly.io health checks (and any uptime monitor) hit this — must respond
// even if the GenLayer RPC is down, so uptime doesn't depend on a third
// party. DB connectivity is the only hard dependency for "healthy".
app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", uptime_s: process.uptime() });
  } catch (err) {
    res.status(503).json({ status: "degraded", error: (err as Error).message });
  }
});

app.get("/", (_req, res) => res.json({ service: "voidance-backend", status: "running" }));

app.use("/api/policies", policiesRouter);
app.use("/api/wallets", walletsRouter);
app.use("/api/stats", statsRouter);

app.use((_req, res) => res.status(404).json({ error: "not found" }));

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error({ err }, "unhandled request error");
  res.status(500).json({ error: "internal server error" });
});

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
