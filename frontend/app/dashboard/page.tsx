"use client";

import useSWR from "swr";
import Link from "next/link";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { StatusChip } from "@/components/StatusChip";

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { data: walletPolicies } = useSWR(
    address ? `wallet-policies-${address}` : null,
    () => api.getWalletPolicies(address as string)
  );
  const { data: allPolicies } = useSWR("policies-for-dashboard", () => api.listPolicies(0, 50));

  if (!isConnected) {
    return (
      <div className="max-w-xl mx-auto px-6 py-24 text-center">
        <h1 className="font-display text-headline-xs text-trust-blue mb-2">Connect your wallet</h1>
        <p className="text-body-sm text-on-surface-variant">
          Connect a wallet to see the policies you sponsor or research, and to manage claims.
        </p>
      </div>
    );
  }

  const sponsored = allPolicies?.filter((p) => walletPolicies?.sponsored.includes(p.id)) ?? [];
  const researched = allPolicies?.filter((p) => walletPolicies?.researched.includes(p.id)) ?? [];

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <h1 className="font-display text-headline-xs text-trust-blue mb-1">Dashboard</h1>
      <p className="text-body-sm text-on-surface-variant mb-8 font-mono text-code-xs">{address}</p>

      <section className="mb-10">
        <h2 className="text-title-sm text-trust-blue mb-3">Policies You Sponsor</h2>
        <PolicyTable policies={sponsored} emptyLabel="You haven't funded any policies yet." />
      </section>

      <section>
        <h2 className="text-title-sm text-trust-blue mb-3">Policies You Research</h2>
        <PolicyTable policies={researched} emptyLabel="You haven't accepted any policies yet." />
      </section>
    </div>
  );
}

function PolicyTable({
  policies,
  emptyLabel,
}: {
  policies: { id: number; project_title: string; status: string }[];
  emptyLabel: string;
}) {
  if (policies.length === 0) {
    return <p className="text-body-sm text-on-surface-variant">{emptyLabel}</p>;
  }
  return (
    <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
      {policies.map((p, i) => (
        <Link
          key={p.id}
          href={`/policies/${p.id}`}
          className={`flex items-center justify-between px-4 py-3 hover:bg-innovation-slate transition-colors ${
            i > 0 ? "border-t border-outline-variant" : ""
          }`}
        >
          <span className="text-body-sm text-trust-blue">
            #{p.id} · {p.project_title}
          </span>
          <StatusChip status={p.status as any} />
        </Link>
      ))}
    </div>
  );
}
