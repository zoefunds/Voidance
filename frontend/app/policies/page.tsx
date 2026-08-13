"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api } from "@/lib/api";
import { readVoidance } from "@/lib/genlayerRead";
import { StatusChip } from "@/components/StatusChip";

function formatGen(wei: string) {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

const STATUS_OPTIONS = [
  "CREATED",
  "ACTIVE",
  "CLAIM_SUBMITTED",
  "EVALUATING",
  "SETTLED_PASS",
  "SETTLED_PARTIAL",
  "SETTLED_FAIL",
  "CANCELLED",
  "EXPIRED_UNACCEPTED",
  "EXPIRED_NO_CLAIM",
];

export default function PoliciesPage() {
  const { data: policies, error, isLoading } = useSWR("policies", () => api.listPolicies(0, 50));
  const [statusFilter, setStatusFilter] = useState("");
  const [fieldFilter, setFieldFilter] = useState("");

  const { data: statusIds } = useSWR(
    statusFilter ? `status-ids-${statusFilter}` : null,
    () => readVoidance<number[]>("get_policy_ids_by_status", [statusFilter])
  );
  const { data: fieldIds } = useSWR(
    fieldFilter.trim() ? `field-ids-${fieldFilter}` : null,
    () => readVoidance<number[]>("get_policy_ids_by_field", [fieldFilter.trim()])
  );

  const filtered = useMemo(() => {
    if (!policies) return policies;
    let list = policies;
    if (statusFilter && statusIds) list = list.filter((p) => statusIds.includes(p.id));
    if (fieldFilter.trim() && fieldIds) list = list.filter((p) => fieldIds.includes(p.id));
    return list;
  }, [policies, statusFilter, statusIds, fieldFilter, fieldIds]);

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-headline-xs text-trust-blue">Open Policies</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Research milestones currently insured on Voidance.
          </p>
        </div>
        <Link href="/policies/new" className="px-4 py-2 bg-trust-blue text-white text-title-sm rounded-lg">
          Fund a Policy
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input w-auto"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          value={fieldFilter}
          onChange={(e) => setFieldFilter(e.target.value)}
          type="text"
          placeholder="Filter by research field…"
          className="input w-auto"
        />
        {(statusFilter || fieldFilter) && (
          <button
            onClick={() => {
              setStatusFilter("");
              setFieldFilter("");
            }}
            className="px-4 py-2 text-body-sm text-on-surface-variant hover:text-trust-blue"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading && <p className="text-body-sm text-on-surface-variant">Loading policies…</p>}
      {error && (
        <p className="text-body-sm text-error-crimson">
          Could not reach the Voidance API yet — connect the backend to see live policies.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {filtered?.map((p) => (
          <Link
            key={p.id}
            href={`/policies/${p.id}`}
            className="block bg-white border border-outline-variant rounded-xl p-4 ambient-card hover:border-research-teal transition-colors"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-label-xs text-on-surface-variant uppercase">#{p.id} · {p.research_field}</span>
              <StatusChip status={p.status} />
            </div>
            <h3 className="text-title-sm text-trust-blue mb-1">{p.project_title}</h3>
            <p className="text-body-sm text-on-surface-variant line-clamp-2 mb-3">{p.project_description}</p>
            <div className="flex gap-4 text-label-xs text-on-surface-variant">
              <span>Coverage: <strong className="text-trust-blue">{formatGen(p.coverage_wei)} GEN</strong></span>
              <span>Premium: <strong className="text-trust-blue">{p.premium_bps / 100}%</strong></span>
            </div>
          </Link>
        ))}
      </div>

      {!isLoading && !error && filtered?.length === 0 && (
        <p className="text-body-sm text-on-surface-variant">
          {statusFilter || fieldFilter ? "No policies match these filters." : "No policies yet — be the first to fund one."}
        </p>
      )}
    </div>
  );
}
