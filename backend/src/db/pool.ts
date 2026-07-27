import { Pool } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  // A lost idle connection must never crash the always-on process — log and
  // let the pool recycle it. This is part of keeping the backend 24/7.
  // eslint-disable-next-line no-console
  console.error("[pg] unexpected idle client error", err);
});
