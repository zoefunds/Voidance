-- Voidance database schema.
--
-- The GenLayer contract is the sole source of truth for money movement and
-- policy state. This database is a fast, queryable CACHE/INDEX kept in sync
-- by the backend's sync loop (src/services/sync.ts) — it must never be
-- treated as authoritative for balances or settlement outcomes.

CREATE TABLE IF NOT EXISTS policies (
    id                      BIGINT PRIMARY KEY,
    sponsor                 TEXT NOT NULL,
    researcher              TEXT,
    project_title           TEXT NOT NULL,
    project_description     TEXT NOT NULL,
    research_field          TEXT NOT NULL,
    methodology_url         TEXT NOT NULL,
    methodology_summary     TEXT NOT NULL DEFAULT '',
    milestone_description   TEXT NOT NULL,
    tags                    JSONB NOT NULL DEFAULT '[]',
    status                  TEXT NOT NULL,
    coverage_wei            NUMERIC(78, 0) NOT NULL,
    premium_bps             INTEGER NOT NULL,
    coverage_deposited      NUMERIC(78, 0) NOT NULL,
    premium_deposited       NUMERIC(78, 0) NOT NULL,
    created_ts              BIGINT NOT NULL,
    accept_deadline_ts      BIGINT NOT NULL,
    milestone_deadline_ts   BIGINT NOT NULL,
    claim_deadline_ts       BIGINT NOT NULL,
    accepted_ts             BIGINT,
    claim_submitted_ts      BIGINT,
    settled_ts              BIGINT,
    claim_narrative         TEXT NOT NULL DEFAULT '',
    evidence_urls           JSONB NOT NULL DEFAULT '[]',
    verdict                 TEXT NOT NULL DEFAULT 'NONE',
    total_score             INTEGER NOT NULL DEFAULT 0,
    confidence              INTEGER NOT NULL DEFAULT 0,
    payout_bps              INTEGER NOT NULL DEFAULT 0,
    criteria                JSONB NOT NULL DEFAULT '{}',
    evaluation_summary      TEXT NOT NULL DEFAULT '',
    evaluation_count        INTEGER NOT NULL DEFAULT 0,
    synced_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_policies_status ON policies (status);
CREATE INDEX IF NOT EXISTS idx_policies_sponsor ON policies (sponsor);
CREATE INDEX IF NOT EXISTS idx_policies_researcher ON policies (researcher);
CREATE INDEX IF NOT EXISTS idx_policies_field ON policies (research_field);

CREATE TABLE IF NOT EXISTS evaluations (
    policy_id               BIGINT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    seq                     INTEGER NOT NULL,
    verdict                 TEXT NOT NULL,
    total_score             INTEGER NOT NULL,
    confidence              INTEGER NOT NULL,
    payout_bps              INTEGER NOT NULL,
    criteria                JSONB NOT NULL DEFAULT '{}',
    summary                 TEXT NOT NULL DEFAULT '',
    evidence_ok_count       INTEGER NOT NULL DEFAULT 0,
    evidence_total_count    INTEGER NOT NULL DEFAULT 0,
    evaluated_ts            BIGINT NOT NULL,
    PRIMARY KEY (policy_id, seq)
);

CREATE TABLE IF NOT EXISTS activity_log (
    policy_id               BIGINT NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
    seq                     INTEGER NOT NULL,
    kind                    TEXT NOT NULL,
    actor                   TEXT NOT NULL,
    amount_wei              NUMERIC(78, 0) NOT NULL DEFAULT 0,
    ts                      BIGINT NOT NULL,
    note                    TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (policy_id, seq)
);

CREATE TABLE IF NOT EXISTS wallets (
    address                 TEXT PRIMARY KEY,
    display_name            TEXT,
    institution              TEXT,
    first_seen_ts           BIGINT NOT NULL,
    last_seen_ts            BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_state (
    key                     TEXT PRIMARY KEY,
    value                   TEXT NOT NULL,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO sync_state (key, value)
VALUES ('last_synced_policy_count', '0')
ON CONFLICT (key) DO NOTHING;
