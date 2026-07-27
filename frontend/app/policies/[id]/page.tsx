"use client";

import useSWR from "swr";
import { use } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { api } from "@/lib/api";
import { StatusChip } from "@/components/StatusChip";
import { VOIDANCE_ABI, VOIDANCE_ADDRESS } from "@/lib/contract";

function formatGen(wei: string) {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function PolicyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const policyId = Number(id);
  const { address } = useAccount();
  const { data: policy, mutate } = useSWR(`policy-${policyId}`, () => api.getPolicy(policyId));
  const { writeContractAsync, isPending } = useWriteContract();

  if (!policy) return <div className="max-w-4xl mx-auto px-6 py-16 text-body-sm">Loading policy…</div>;

  const isResearcher = address?.toLowerCase() === policy.researcher?.toLowerCase();
  const isSponsor = address?.toLowerCase() === policy.sponsor?.toLowerCase();
  const requiredPremium = (BigInt(policy.coverage_wei) * BigInt(policy.premium_bps)) / 10000n;

  async function acceptPolicy() {
    await writeContractAsync({
      address: VOIDANCE_ADDRESS,
      abi: VOIDANCE_ABI,
      functionName: "accept_policy",
      args: [BigInt(policyId), BigInt(Math.floor(Date.now() / 1000))],
      value: requiredPremium,
    });
    mutate();
  }

  async function evaluateClaim() {
    await writeContractAsync({
      address: VOIDANCE_ADDRESS,
      abi: VOIDANCE_ABI,
      functionName: "evaluate_claim",
      args: [BigInt(policyId), BigInt(Math.floor(Date.now() / 1000))],
    });
    mutate();
  }

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
        <a href={policy.methodology_url} target="_blank" rel="noreferrer" className="text-body-sm text-research-teal hover:underline">
          View methodology document ↗
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
        {policy.status === "ACTIVE" && isResearcher && (
          <a href={`/policies/${policy.id}/claim`} className="px-5 py-2.5 bg-alert-amber text-trust-blue text-title-sm rounded-lg">
            File a Failure Claim
          </a>
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
      </div>
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
