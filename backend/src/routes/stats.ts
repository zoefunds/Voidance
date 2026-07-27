import { Router } from "express";
import { pool } from "../db/pool.js";
import { readVoidance } from "../services/genlayerClient.js";

export const statsRouter = Router();

statsRouter.get("/", async (_req, res, next) => {
  try {
    // Prefer a live contract read for the headline stats since it's cheap
    // (one view call) and users expect these numbers to be exact; fall back
    // to the cached DB snapshot if the RPC is briefly unreachable so the
    // endpoint stays up even during a GenLayer node hiccup.
    try {
      const stats = await readVoidance("get_platform_stats");
      return res.json(stats);
    } catch {
      const { rows } = await pool.query(
        `SELECT
           count(*)::int AS policy_count,
           coalesce(sum(coverage_wei), 0)::text AS total_coverage_funded_wei,
           coalesce(sum(payout_bps), 0)::int AS total_payouts_wei
         FROM policies`
      );
      return res.json(rows[0]);
    }
  } catch (err) {
    next(err);
  }
});
