/**
 * Backend API tests — run against a REAL Postgres (see README for the
 * throwaway docker container used locally / in CI), not a mocked pool.
 * GENLAYER_RPC_URL is deliberately pointed at an unreachable address so
 * /api/stats is forced onto its DB-fallback path without needing a live
 * contract — that fallback path is exactly what's under test here.
 */
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";

process.env.DATABASE_URL ??= "postgres://voidance:voidance@localhost:5442/voidance_test";
process.env.GENLAYER_RPC_URL ??= "http://127.0.0.1:1/unreachable";
process.env.VOIDANCE_CONTRACT_ADDRESS ??= "0x9a6bCe6a759c6E9ca20d90ca593B759CfC5E4f77";
process.env.CORS_ORIGINS ??= "http://localhost:3000";

const { pool } = await import("../src/db/pool.js");
const { createApp } = await import("../src/app.js");

const app = createApp();

const SPONSOR = "0x1111111111111111111111111111111111111111";
const RESEARCHER = "0x2222222222222222222222222222222222222222";

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS policies (
      id BIGINT PRIMARY KEY, sponsor TEXT NOT NULL, researcher TEXT,
      project_title TEXT NOT NULL, project_description TEXT NOT NULL, research_field TEXT NOT NULL,
      methodology_url TEXT NOT NULL, methodology_summary TEXT NOT NULL DEFAULT '',
      milestone_description TEXT NOT NULL, tags JSONB NOT NULL DEFAULT '[]', status TEXT NOT NULL,
      coverage_wei NUMERIC(78,0) NOT NULL, premium_bps INTEGER NOT NULL,
      coverage_deposited NUMERIC(78,0) NOT NULL, premium_deposited NUMERIC(78,0) NOT NULL,
      created_ts BIGINT NOT NULL, accept_deadline_ts BIGINT NOT NULL, milestone_deadline_ts BIGINT NOT NULL,
      claim_deadline_ts BIGINT NOT NULL, accepted_ts BIGINT, claim_submitted_ts BIGINT, settled_ts BIGINT,
      claim_narrative TEXT NOT NULL DEFAULT '', evidence_urls JSONB NOT NULL DEFAULT '[]',
      verdict TEXT NOT NULL DEFAULT 'NONE', total_score INTEGER NOT NULL DEFAULT 0,
      confidence INTEGER NOT NULL DEFAULT 0, payout_bps INTEGER NOT NULL DEFAULT 0,
      criteria JSONB NOT NULL DEFAULT '{}', evaluation_summary TEXT NOT NULL DEFAULT '',
      evaluation_count INTEGER NOT NULL DEFAULT 0, synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS evaluations (
      policy_id BIGINT NOT NULL, seq INTEGER NOT NULL, verdict TEXT NOT NULL, total_score INTEGER NOT NULL,
      confidence INTEGER NOT NULL, payout_bps INTEGER NOT NULL, criteria JSONB NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL DEFAULT '', evidence_ok_count INTEGER NOT NULL DEFAULT 0,
      evidence_total_count INTEGER NOT NULL DEFAULT 0, evaluated_ts BIGINT NOT NULL,
      PRIMARY KEY (policy_id, seq)
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      policy_id BIGINT NOT NULL, seq INTEGER NOT NULL, kind TEXT NOT NULL, actor TEXT NOT NULL,
      amount_wei NUMERIC(78,0) NOT NULL DEFAULT 0, ts BIGINT NOT NULL, note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (policy_id, seq)
    );
  `);
});

beforeEach(async () => {
  await pool.query("TRUNCATE policies, evaluations, activity_log");
});

after(async () => {
  await pool.end();
});

async function insertPolicy(id: number, overrides: Partial<Record<string, unknown>> = {}) {
  const row = {
    id,
    sponsor: SPONSOR,
    researcher: overrides.researcher ?? null,
    project_title: "Test Policy",
    project_description: "desc",
    research_field: "Physics",
    methodology_url: "https://example.com/m.pdf",
    status: overrides.status ?? "CREATED",
    coverage_wei: "100000",
    premium_bps: 300,
    coverage_deposited: "100000",
    premium_deposited: "0",
    created_ts: 1000,
    accept_deadline_ts: 2000,
    milestone_deadline_ts: 3000,
    claim_deadline_ts: 4000,
    milestone_description: "milestone",
    ...overrides,
  };
  await pool.query(
    `INSERT INTO policies (id, sponsor, researcher, project_title, project_description, research_field,
       methodology_url, milestone_description, status, coverage_wei, premium_bps, coverage_deposited,
       premium_deposited, created_ts, accept_deadline_ts, milestone_deadline_ts, claim_deadline_ts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [
      row.id, row.sponsor, row.researcher, row.project_title, row.project_description, row.research_field,
      row.methodology_url, row.milestone_description, row.status, row.coverage_wei, row.premium_bps,
      row.coverage_deposited, row.premium_deposited, row.created_ts, row.accept_deadline_ts,
      row.milestone_deadline_ts, row.claim_deadline_ts,
    ]
  );
}

test("GET /health returns ok when Postgres is reachable", async () => {
  const res = await request(app).get("/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("GET /api/policies returns an empty array with no data", async () => {
  const res = await request(app).get("/api/policies");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, []);
});

test("GET /api/policies returns inserted rows newest-first", async () => {
  await insertPolicy(1);
  await insertPolicy(2);
  const res = await request(app).get("/api/policies");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2);
  assert.equal(res.body[0].id, 2); // newest first
  assert.equal(res.body[0].sponsor, SPONSOR);
});

test("GET /api/policies?status=ACTIVE filters correctly", async () => {
  await insertPolicy(1, { status: "CREATED" });
  await insertPolicy(2, { status: "ACTIVE", researcher: RESEARCHER });
  const res = await request(app).get("/api/policies?status=ACTIVE");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 1);
  assert.equal(res.body[0].id, 2);
});

test("GET /api/policies/:id returns 404 for a missing policy", async () => {
  const res = await request(app).get("/api/policies/999");
  assert.equal(res.status, 404);
});

test("GET /api/policies/:id returns the matching policy", async () => {
  await insertPolicy(7);
  const res = await request(app).get("/api/policies/7");
  assert.equal(res.status, 200);
  assert.equal(res.body.id, 7);
  assert.equal(res.body.coverage_wei, "100000");
});

test("GET /api/policies/:id rejects a non-numeric id", async () => {
  const res = await request(app).get("/api/policies/not-a-number");
  assert.equal(res.status, 400);
});

test("GET /api/wallets/:address/policies rejects a malformed address", async () => {
  const res = await request(app).get("/api/wallets/not-an-address/policies");
  assert.equal(res.status, 400);
});

test("GET /api/wallets/:address/policies splits sponsored vs researched", async () => {
  await insertPolicy(1, { sponsor: SPONSOR, researcher: null });
  await insertPolicy(2, { sponsor: SPONSOR, researcher: RESEARCHER, status: "ACTIVE" });
  const res = await request(app).get(`/api/wallets/${SPONSOR}/policies`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.sponsored.sort(), [1, 2]);
  assert.deepEqual(res.body.researched, []);
});

test("GET /api/stats falls back to a DB aggregate when the RPC is unreachable", async () => {
  await insertPolicy(1);
  await insertPolicy(2);
  const res = await request(app).get("/api/stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.policy_count, 2);
});

test("unknown routes return 404 with a JSON body", async () => {
  const res = await request(app).get("/api/does-not-exist");
  assert.equal(res.status, 404);
  assert.equal(res.body.error, "not found");
});
