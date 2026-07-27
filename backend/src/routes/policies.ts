import { Router } from "express";
import { pool } from "../db/pool.js";
import { cacheGet, cacheSet } from "../redis.js";

export const policiesRouter = Router();

const LIST_CACHE_TTL_SECONDS = 8;

function mapPolicyRow(row: any) {
  return {
    id: Number(row.id),
    sponsor: row.sponsor,
    researcher: row.researcher,
    project_title: row.project_title,
    project_description: row.project_description,
    research_field: row.research_field,
    methodology_url: row.methodology_url,
    methodology_summary: row.methodology_summary,
    milestone_description: row.milestone_description,
    tags: row.tags,
    status: row.status,
    coverage_wei: row.coverage_wei,
    premium_bps: row.premium_bps,
    coverage_deposited: row.coverage_deposited,
    premium_deposited: row.premium_deposited,
    milestone_deadline_ts: Number(row.milestone_deadline_ts),
    claim_deadline_ts: Number(row.claim_deadline_ts),
    verdict: row.verdict,
    total_score: row.total_score,
    confidence: row.confidence,
    payout_bps: row.payout_bps,
    criteria: row.criteria,
    evaluation_summary: row.evaluation_summary,
    evidence_urls: row.evidence_urls,
  };
}

policiesRouter.get("/", async (req, res, next) => {
  try {
    const offset = Math.max(0, Number(req.query.offset ?? 0));
    const limit = Math.min(50, Math.max(1, Number(req.query.limit ?? 20)));
    const status = typeof req.query.status === "string" ? req.query.status.toUpperCase() : null;
    const cacheKey = `policies:list:${status ?? "ALL"}:${offset}:${limit}`;

    const cached = await cacheGet<ReturnType<typeof mapPolicyRow>[]>(cacheKey);
    if (cached) return res.json(cached);

    const { rows } = status
      ? await pool.query(
          "SELECT * FROM policies WHERE status = $1 ORDER BY id DESC OFFSET $2 LIMIT $3",
          [status, offset, limit]
        )
      : await pool.query("SELECT * FROM policies ORDER BY id DESC OFFSET $1 LIMIT $2", [offset, limit]);

    const mapped = rows.map(mapPolicyRow);
    await cacheSet(cacheKey, mapped, LIST_CACHE_TTL_SECONDS);
    res.json(mapped);
  } catch (err) {
    next(err);
  }
});

policiesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 0) {
      return res.status(400).json({ error: "invalid policy id" });
    }
    const { rows } = await pool.query("SELECT * FROM policies WHERE id = $1", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "policy not found" });
    res.json(mapPolicyRow(rows[0]));
  } catch (err) {
    next(err);
  }
});

policiesRouter.get("/:id/evaluations", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      "SELECT * FROM evaluations WHERE policy_id = $1 ORDER BY seq ASC",
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

policiesRouter.get("/:id/activity", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      "SELECT * FROM activity_log WHERE policy_id = $1 ORDER BY seq DESC LIMIT 50",
      [id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
