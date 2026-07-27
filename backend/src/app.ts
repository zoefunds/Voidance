import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./logger.js";
import { pool } from "./db/pool.js";
import { policiesRouter } from "./routes/policies.js";
import { walletsRouter } from "./routes/wallets.js";
import { statsRouter } from "./routes/stats.js";

/**
 * Builds the Express app without binding a port or starting the sync loop —
 * kept separate from index.ts's bootstrap so tests can exercise real routes
 * against a real Postgres via supertest without spinning up the whole
 * always-on process (sync interval, signal handlers, etc).
 */
export function createApp() {
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

  // Deliberately in-memory, no external store: the backend's uptime must
  // never depend on Redis (or anything else) being reachable. Rate-limit
  // counters reset on process restart — an acceptable trade against a
  // hard "never dies" requirement, given Fly keeps >=1 machine running and
  // restarts are infrequent.
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
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

  return app;
}
