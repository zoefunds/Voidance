"use client";

import useSWR from "swr";
import { useState } from "react";
import { api } from "@/lib/api";
import { StatusChip } from "@/components/StatusChip";
import { useVoidanceWallet } from "@/lib/genlayerWallet";
import { readVoidance } from "@/lib/genlayerRead";
import { LinkIcon } from "@/components/Icons";

function formatGen(wei: string | number) {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface ActivityEvent {
  kind: string;
  actor: string;
  amount: number;
  ts: number;
  note: string;
}

interface SettlementPreview {
  verdict: string;
  researcher_payout_wei: number;
  sponsor_refund_wei: number;
  protocol_fee_wei: number;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Next.js 14 App Router passes `params` as a plain object (not the Promise
// Next.js 15 introduced) — no `use()` call needed/valid here.
export default function PolicyDetailPage({ params }: { params: { id: string } }) {
  const policyId = Number(params.id);
  const { address, write } = useVoidanceWallet();
  const { data: policy, mutate } = useSWR(`policy-${policyId}`, () => api.getPolicy(policyId));
  const { data: activity } = useSWR(`policy-activity-${policyId}`, () =>
    readVoidance<ActivityEvent[]>("get_activity", [policyId, 0, 25])
  );
  const { data: preview } = useSWR(
    policy && (policy.status === "CLAIM_SUBMITTED" || policy.verdict !== "NONE")
      ? `policy-preview-${policyId}`
      : null,
    () => readVoidance<SettlementPreview>("quote_settlement_preview", [policyId])
  );
  const { data: quotedPremium } = useSWR(
    policy && policy.status === "CREATED" ? `policy-premium-quote-${policyId}` : null,
    () => readVoidance<number | string>("quote_required_premium", [policyId])
  );
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!policy) return <div className="max-w-4xl mx-auto px-6 py-16 text-body-sm">Loading policy…</div>;

  const isResearcher = address?.toLowerCase() === policy.researcher?.toLowerCase();
  const isSponsor = address?.toLowerCase() === policy.sponsor?.toLowerCase();
  const requiredPremium =
    quotedPremium !== undefined
      ? BigInt(quotedPremium)
      : (BigInt(policy.coverage_wei) * BigInt(policy.premium_bps)) / 10000n;

  async function runWrite(fn: () => Promise<string>) {
    setError(null);
    setIsPending(true);
    try {
      await fn();
      await mutate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "transaction failed");
    } finally {
      setIsPending(false);
    }
  }

  const acceptPolicy = () =>
    runWrite(() => write("accept_policy", [policyId], requiredPremium));

  const evaluateClaim = () =>
    runWrite(() => write("evaluate_claim", [policyId]));

  const withdrawClaim = () =>
    runWrite(() => write("withdraw_claim", [policyId]));

  const cancelPolicy = () =>
    runWrite(() => write("cancel_policy", [policyId]));

  const claimSponsorTimeout = () =>
    runWrite(() => write("claim_sponsor_timeout", [policyId]));

  const claimExpiredNoClaim = () =>
    runWrite(() => write("claim_expired_no_claim", [policyId]));

  const now = Date.now() / 1000;
  const acceptWindowExpired = policy.accept_deadline_ts && now > policy.accept_deadline_ts;
  const claimWindowExpired = policy.claim_deadline_ts && now > policy.claim_deadline_ts;

  return (
    <div className="max-w-4xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-center justify-between mb-4">
        <span className="text-label-xs text-on-surface-variant uppercase">
          Policy #{policy.id} · {policy.research_field}
        </span>
        <StatusChip status={policy.status} />
      </div>

      <h1 className="font-display text-headline-xs text-trust-blue mb-2">{policy.project_title}</h1>
      <p className="text-body-sm text-on-surface-variant mb-6">{policy.project_description}</p>

      <div className="grid md:grid-cols-3 gap-3 mb-8">
        <Stat label="Coverage" value={`${formatGen(policy.coverage_wei)} GEN`} />
        <Stat label="Premium Bond" value={`${policy.premium_bps / 100}%`} />
        <Stat label="Deposited" value={`${formatGen(policy.coverage_deposited)} GEN`} />
      </div>

      <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card mb-6">
        <h2 className="text-title-sm text-trust-blue mb-2">Insured Milestone</h2>
        <p className="text-body-sm text-on-surface-variant mb-3">{policy.milestone_description}</p>
        <a
          href={policy.methodology_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-body-sm text-research-teal hover:underline"
        >
          <LinkIcon width={14} height={14} />
          View methodology document
        </a>
      </div>

      {policy.verdict !== "NONE" && (
        <div className="bg-trust-blue/5 border-l-4 border-research-teal p-5 rounded-r mb-6">
          <h2 className="text-title-sm text-trust-blue mb-2">
            Verdict: {policy.verdict} <span className="text-on-surface-variant font-normal">({policy.total_score}/100, {policy.confidence}% confidence)</span>
          </h2>
          <p className="text-body-sm text-on-surface-variant">{policy.evaluation_summary}</p>
        </div>
      )}

      {preview && (
        <div className="bg-innovation-slate border border-outline-variant rounded-xl p-5 mb-6">
          <h2 className="text-title-sm text-trust-blue mb-3">
            {policy.verdict === "NONE" ? "Pending Settlement Preview" : "Settlement Breakdown"}
          </h2>
          <div className="grid md:grid-cols-3 gap-3">
            <Stat label="Researcher Payout" value={`${formatGen(preview.researcher_payout_wei)} GEN`} />
            <Stat label="Sponsor Refund" value={`${formatGen(preview.sponsor_refund_wei)} GEN`} />
            <Stat label="Protocol Fee" value={`${formatGen(preview.protocol_fee_wei)} GEN`} />
          </div>
        </div>
      )}

      {error && <p className="text-body-sm text-error-crimson mb-4">{error}</p>}

      <div className="flex flex-wrap gap-3">
        {policy.status === "CREATED" && !isSponsor && (
          <button
            onClick={acceptPolicy}
            disabled={isPending}
            className="px-5 py-2.5 bg-research-teal text-trust-blue text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Confirming…" : `Accept & Stake ${formatGen(requiredPremium.toString())} GEN`}
          </button>
        )}
        {policy.status === "CREATED" && isSponsor && (
          <button
            onClick={cancelPolicy}
            disabled={isPending}
            className="px-5 py-2.5 bg-white border border-error-crimson text-error-crimson text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Confirming…" : "Cancel Policy & Reclaim Coverage"}
          </button>
        )}
        {policy.status === "CREATED" && acceptWindowExpired && (
          <button
            onClick={claimSponsorTimeout}
            disabled={isPending}
            className="px-5 py-2.5 bg-white border border-outline-variant text-trust-blue text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Confirming…" : "Acceptance Window Expired — Reclaim Coverage"}
          </button>
        )}
        {policy.status === "ACTIVE" && isResearcher && (
          <a href={`/policies/${policy.id}/claim`} className="px-5 py-2.5 bg-alert-amber text-trust-blue text-title-sm rounded-lg">
            File a Failure Claim
          </a>
        )}
        {policy.status === "ACTIVE" && claimWindowExpired && (
          <button
            onClick={claimExpiredNoClaim}
            disabled={isPending}
            className="px-5 py-2.5 bg-white border border-outline-variant text-trust-blue text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Confirming…" : "Claim Window Expired — Settle & Refund Both Sides"}
          </button>
        )}
        {policy.status === "CLAIM_SUBMITTED" && (
          <button
            onClick={evaluateClaim}
            disabled={isPending}
            className="px-5 py-2.5 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Running validator consensus…" : "Trigger Evaluation (permissionless)"}
          </button>
        )}
        {policy.status === "CLAIM_SUBMITTED" && isResearcher && (
          <button
            onClick={withdrawClaim}
            disabled={isPending}
            className="px-5 py-2.5 bg-white border border-outline-variant text-trust-blue text-title-sm rounded-lg disabled:opacity-50"
          >
            {isPending ? "Confirming…" : "Withdraw Claim"}
          </button>
        )}
      </div>

      {activity && activity.length > 0 && (
        <div className="mt-10">
          <h2 className="text-title-sm text-trust-blue mb-3">Activity Log</h2>
          <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
            {activity.map((evt, i) => (
              <div
                key={i}
                className={`flex items-center justify-between px-5 py-3 text-body-sm ${
                  i > 0 ? "border-t border-outline-variant" : ""
                }`}
              >
                <div>
                  <span className="font-medium text-trust-blue">{evt.kind}</span>
                  <span className="text-on-surface-variant"> by {shortAddr(evt.actor)}</span>
                  {evt.note && <span className="text-on-surface-variant"> — {evt.note}</span>}
                </div>
                <div className="text-label-xs text-on-surface-variant whitespace-nowrap">
                  {evt.amount > 0 && `${formatGen(evt.amount)} GEN · `}
                  {new Date(evt.ts * 1000).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-innovation-slate rounded-lg p-3">
      <div className="text-label-xs text-on-surface-variant uppercase">{label}</div>
      <div className="text-title-sm text-trust-blue">{value}</div>
    </div>
  );
}
