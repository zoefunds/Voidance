"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { readVoidance } from "@/lib/genlayerRead";
import { useVoidanceWallet } from "@/lib/genlayerWallet";
import { StatusChip } from "@/components/StatusChip";
import { WalletIcon, LockIcon } from "@/components/Icons";

function formatGen(wei: string | number | bigint) {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function DashboardPage() {
  const { address, isConnected } = useAccount();
  const { write } = useVoidanceWallet();
  const { data: walletPolicies } = useSWR(
    address ? `wallet-policies-${address}` : null,
    () => api.getWalletPolicies(address as string)
  );
  const { data: allPolicies } = useSWR("policies-for-dashboard", () => api.listPolicies(0, 50));

  const [balance, setBalance] = useState<bigint | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshBalance() {
    if (!address) return;
    try {
      const raw = await readVoidance<number | string>("get_balance_of", [address]);
      setBalance(BigInt(raw));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to read balance");
    }
  }

  useEffect(() => {
    refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function handleWithdraw() {
    setError(null);
    setWithdrawing(true);
    try {
      await write("withdraw_all", []);
      await refreshBalance();
    } catch (err) {
      setError(err instanceof Error ? err.message : "withdraw failed");
    } finally {
      setWithdrawing(false);
    }
  }

  if (!isConnected) {
    return (
      <div className="max-w-md mx-auto px-6 py-24">
        <div className="bg-white border border-outline-variant rounded-xl p-8 ambient-card text-center">
          <div className="w-12 h-12 rounded-full bg-research-teal/15 text-research-teal flex items-center justify-center mx-auto mb-4">
            <WalletIcon width={22} height={22} />
          </div>
          <h1 className="font-display text-headline-xs text-trust-blue mb-2">Connect your wallet</h1>
          <p className="text-body-sm text-on-surface-variant">
            Connect a wallet to see the policies you sponsor or research, and to manage claims.
          </p>
        </div>
      </div>
    );
  }

  const sponsored = allPolicies?.filter((p) => walletPolicies?.sponsored.includes(p.id)) ?? [];
  const researched = allPolicies?.filter((p) => walletPolicies?.researched.includes(p.id)) ?? [];
  const hasBalance = balance !== null && balance > 0n;

  return (
    <div className="max-w-6xl mx-auto px-6 md:px-10 py-10">
      <h1 className="font-display text-headline-xs text-trust-blue mb-1">Dashboard</h1>
      <p className="text-body-sm text-on-surface-variant mb-8 font-mono text-code-xs">{address}</p>

      {error && <p className="text-body-sm text-error-crimson mb-4">{error}</p>}

      <div
        className={`rounded-xl p-5 ambient-card mb-10 flex items-center justify-between border ${
          hasBalance ? "bg-trust-blue text-white border-trust-blue" : "bg-white border-outline-variant"
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
              hasBalance ? "bg-research-teal text-trust-blue" : "bg-research-teal/15 text-research-teal"
            }`}
          >
            <LockIcon width={18} height={18} />
          </div>
          <div>
            <div className={`text-label-xs uppercase ${hasBalance ? "text-white/70" : "text-on-surface-variant"}`}>
              Withdrawable Balance
            </div>
            <div className="text-title-sm">{balance === null ? "Loading…" : `${formatGen(balance)} GEN`}</div>
            {!hasBalance && balance !== null && (
              <div className="text-label-xs text-on-surface-variant mt-1">
                Credited after a policy settles, expires, or gets cancelled — not automatic before that.
              </div>
            )}
          </div>
        </div>
        {hasBalance && (
          <button
            onClick={handleWithdraw}
            disabled={withdrawing}
            className="px-5 py-2.5 bg-research-teal text-trust-blue text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
          >
            {withdrawing ? "Confirming…" : "Withdraw to Wallet"}
          </button>
        )}
      </div>

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
    return (
      <div className="bg-innovation-slate border border-outline-variant border-dashed rounded-xl p-6 text-body-sm text-on-surface-variant">
        {emptyLabel}
      </div>
    );
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
