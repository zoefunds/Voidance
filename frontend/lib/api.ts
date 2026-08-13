// Thin client for the Voidance backend (backend/src) which itself relays
// reads/writes to the deployed GenLayer contract. Kept separate from direct
// contract calls so the frontend never needs the GenLayer RPC details.
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type PolicyStatus =
  | "CREATED"
  | "ACTIVE"
  | "CLAIM_SUBMITTED"
  | "EVALUATING"
  | "SETTLED_PASS"
  | "SETTLED_PARTIAL"
  | "SETTLED_FAIL"
  | "CANCELLED"
  | "EXPIRED_UNACCEPTED"
  | "EXPIRED_NO_CLAIM";

export interface Policy {
  id: number;
  sponsor: string;
  researcher: string | null;
  project_title: string;
  project_description: string;
  research_field: string;
  methodology_url: string;
  milestone_description: string;
  tags: string[];
  status: PolicyStatus;
  coverage_wei: string;
  premium_bps: number;
  coverage_deposited: string;
  premium_deposited: string;
  milestone_deadline_ts: number;
  accept_deadline_ts: number;
  claim_deadline_ts: number;
  verdict: string;
  total_score: number;
  confidence: number;
  payout_bps: number;
  evaluation_summary: string;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

export const api = {
  listPolicies: (offset = 0, limit = 20) =>
    apiGet<Policy[]>(`/api/policies?offset=${offset}&limit=${limit}`),
  getPolicy: (id: number) => apiGet<Policy>(`/api/policies/${id}`),
  getPlatformStats: () =>
    apiGet<{ policy_count: number; total_coverage_funded_wei: string; total_payouts_wei: string }>(
      "/api/stats"
    ),
  getWalletPolicies: (address: string) =>
    apiGet<{ sponsored: number[]; researched: number[] }>(`/api/wallets/${address}/policies`),
};
