import { pool } from "../db/pool.js";
import { readVoidance } from "./genlayerClient.js";
import { logger } from "../logger.js";

interface ContractPolicy {
  id: number;
  sponsor: string;
  researcher: string | null;
  project_title: string;
  project_description: string;
  research_field: string;
  methodology_url: string;
  methodology_summary: string;
  milestone_description: string;
  tags: string[];
  status: string;
  coverage_wei: number | string;
  premium_bps: number;
  coverage_deposited: number | string;
  premium_deposited: number | string;
  created_ts: number;
  accept_deadline_ts: number;
  milestone_deadline_ts: number;
  claim_deadline_ts: number;
  accepted_ts: number;
  claim_submitted_ts: number;
  settled_ts: number;
  claim_narrative: string;
  evidence_urls: string[];
  verdict: string;
  total_score: number;
  confidence: number;
  payout_bps: number;
  criteria: Record<string, number>;
  evaluation_summary: string;
  evaluation_count: number;
}

async function upsertPolicy(p: ContractPolicy) {
  await pool.query(
    `INSERT INTO policies (
       id, sponsor, researcher, project_title, project_description, research_field,
       methodology_url, methodology_summary, milestone_description, tags, status,
       coverage_wei, premium_bps, coverage_deposited, premium_deposited,
       created_ts, accept_deadline_ts, milestone_deadline_ts, claim_deadline_ts,
       accepted_ts, claim_submitted_ts, settled_ts, claim_narrative, evidence_urls,
       verdict, total_score, confidence, payout_bps, criteria, evaluation_summary,
       evaluation_count, synced_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,
       $25,$26,$27,$28,$29,$30,$31, now()
     )
     ON CONFLICT (id) DO UPDATE SET
       researcher = EXCLUDED.researcher,
       status = EXCLUDED.status,
       coverage_deposited = EXCLUDED.coverage_deposited,
       premium_deposited = EXCLUDED.premium_deposited,
       accepted_ts = EXCLUDED.accepted_ts,
       claim_submitted_ts = EXCLUDED.claim_submitted_ts,
       settled_ts = EXCLUDED.settled_ts,
       claim_narrative = EXCLUDED.claim_narrative,
       evidence_urls = EXCLUDED.evidence_urls,
       verdict = EXCLUDED.verdict,
       total_score = EXCLUDED.total_score,
       confidence = EXCLUDED.confidence,
       payout_bps = EXCLUDED.payout_bps,
       criteria = EXCLUDED.criteria,
       evaluation_summary = EXCLUDED.evaluation_summary,
       evaluation_count = EXCLUDED.evaluation_count,
       synced_at = now()`,
    [
      p.id, p.sponsor, p.researcher, p.project_title, p.project_description, p.research_field,
      p.methodology_url, p.methodology_summary, p.milestone_description, JSON.stringify(p.tags), p.status,
      String(p.coverage_wei), p.premium_bps, String(p.coverage_deposited), String(p.premium_deposited),
      p.created_ts, p.accept_deadline_ts, p.milestone_deadline_ts, p.claim_deadline_ts,
      p.accepted_ts || null, p.claim_submitted_ts || null, p.settled_ts || null,
      p.claim_narrative, JSON.stringify(p.evidence_urls),
      p.verdict, p.total_score, p.confidence, p.payout_bps, JSON.stringify(p.criteria),
      p.evaluation_summary, p.evaluation_count,
    ]
  );
}

async function syncEvaluationHistory(policyId: number) {
  const history = await readVoidance<any[]>("get_evaluation_history", [policyId]);
  for (let seq = 0; seq < history.length; seq++) {
    const rec = history[seq];
    await pool.query(
      `INSERT INTO evaluations (policy_id, seq, verdict, total_score, confidence, payout_bps,
         criteria, summary, evidence_ok_count, evidence_total_count, evaluated_ts)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (policy_id, seq) DO NOTHING`,
      [
        policyId, seq, rec.verdict, rec.total_score, rec.confidence, rec.payout_bps,
        JSON.stringify(rec.criteria), rec.summary, rec.evidence_ok_count, rec.evidence_total_count,
        rec.evaluated_ts,
      ]
    );
  }
}

/**
 * Pull every policy from the contract and upsert into Postgres. Runs on a
 * fixed interval (see index.ts) so the API stays fast without hitting the
 * GenLayer RPC on every frontend request. The contract remains authoritative
 * — this is a read cache only, never a write path.
 */
export async function syncOnce(): Promise<void> {
  const count = await readVoidance<number>("get_policy_count");
  if (count === 0) return;

  const pageSize = 50;
  for (let offset = 0; offset < count; offset += pageSize) {
    const batch = await readVoidance<ContractPolicy[]>("get_policies", [offset, pageSize]);
    for (const policy of batch) {
      await upsertPolicy(policy);
      if (policy.evaluation_count > 0) {
        await syncEvaluationHistory(policy.id);
      }
    }
  }

  await pool.query(
    `INSERT INTO sync_state (key, value, updated_at) VALUES ('last_synced_policy_count', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [String(count)]
  );
  logger.info({ count }, "sync cycle complete");
}

let syncing = false;

export function startSyncLoop(intervalMs: number): NodeJS.Timeout {
  const tick = async () => {
    if (syncing) return; // never overlap sync cycles
    syncing = true;
    try {
      await syncOnce();
    } catch (err) {
      // A failed sync cycle must never crash the always-on process — log
      // and retry on the next tick.
      logger.error({ err }, "sync cycle failed");
    } finally {
      syncing = false;
    }
  };
  void tick();
  return setInterval(tick, intervalMs);
}
