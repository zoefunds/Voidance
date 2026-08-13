"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useAccount } from "wagmi";
import { api } from "@/lib/api";
import { readVoidance } from "@/lib/genlayerRead";
import { useVoidanceWallet } from "@/lib/genlayerWallet";
import { StatusChip } from "@/components/StatusChip";
import { ShieldIcon, GearIcon, LockIcon } from "@/components/Icons";

interface Config {
  owner: string;
  paused: boolean;
  protocol_fee_bps: number;
  min_premium_bps: number;
  min_coverage_wei: number;
  default_accept_window_seconds: number;
  default_claim_grace_seconds: number;
}

function formatGen(wei: string | number) {
  return (Number(wei) / 1e18).toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export default function AdminPage() {
  const { address, isConnected } = useAccount();
  const { write } = useVoidanceWallet();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [minPremiumInput, setMinPremiumInput] = useState("");
  const [minCoverageInput, setMinCoverageInput] = useState("");
  const [acceptWindowInput, setAcceptWindowInput] = useState("");
  const [claimGraceInput, setClaimGraceInput] = useState("");
  const [adminAddrInput, setAdminAddrInput] = useState("");
  const [newOwnerInput, setNewOwnerInput] = useState("");

  const { data: stats, mutate: mutateStats } = useSWR("admin-stats", () => api.getPlatformStats());
  const { data: policies } = useSWR("admin-policies", () => api.listPolicies(0, 50));

  useEffect(() => {
    if (!address) {
      setIsAdmin(null);
      setConfig(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [adminFlag, cfg] = await Promise.all([
          readVoidance<boolean>("is_admin", [address]),
          readVoidance<Config>("get_config"),
        ]);
        if (!cancelled) {
          setIsAdmin(adminFlag);
          setConfig(cfg);
          setFeeInput(String(cfg.protocol_fee_bps));
          setMinPremiumInput(String(cfg.min_premium_bps));
          setMinCoverageInput(String(cfg.min_coverage_wei));
          setAcceptWindowInput(String(cfg.default_accept_window_seconds));
          setClaimGraceInput(String(cfg.default_claim_grace_seconds));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to load admin state");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  async function runAction(label: string, fn: () => Promise<string>) {
    setError(null);
    setBusy(label);
    try {
      await fn();
      const cfg = await readVoidance<Config>("get_config");
      setConfig(cfg);
      mutateStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : "transaction failed");
    } finally {
      setBusy(null);
    }
  }

  if (!isConnected) {
    return (
      <EmptyState
        title="Connect your wallet"
        body="Connect the owner/admin wallet to access platform controls."
      />
    );
  }

  if (isAdmin === null) {
    return <EmptyState title="Checking permissions…" body="" />;
  }

  if (isAdmin === false) {
    return (
      <EmptyState
        title="Not authorized"
        body="This wallet is not a Voidance admin. Only the contract owner or an address added via add_admin() can access this page."
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
      <div className="flex items-center gap-2 mb-1">
        <ShieldIcon width={20} height={20} className="text-research-teal" />
        <h1 className="font-display text-headline-xs text-trust-blue">Admin Console</h1>
      </div>
      <p className="text-body-sm text-on-surface-variant mb-8">
        Platform-wide controls for the Voidance contract. Every action here signs a real transaction.
      </p>

      {error && <p className="text-body-sm text-error-crimson mb-4">{error}</p>}

      <div className="grid md:grid-cols-4 gap-3 mb-8">
        <Stat label="Policies" value={String(stats?.policy_count ?? "—")} />
        <Stat label="Coverage Funded" value={stats ? `${formatGen(stats.total_coverage_funded_wei)} GEN` : "—"} />
        <Stat label="Total Payouts" value={stats ? `${formatGen(stats.total_payouts_wei)} GEN` : "—"} />
        <Stat
          label="Status"
          value={config?.paused ? "PAUSED" : "LIVE"}
          accent={config?.paused ? "text-error-crimson" : "text-success-green"}
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <div className="flex items-center gap-2 mb-3">
            <LockIcon width={16} height={16} className="text-research-teal" />
            <h2 className="text-title-sm text-trust-blue">Circuit Breaker</h2>
          </div>
          <p className="text-body-sm text-on-surface-variant mb-4">
            Pausing halts new policies, acceptances, claims, and settlement. Withdrawals of already-credited
            balances always remain available.
          </p>
          <button
            disabled={busy !== null}
            onClick={() =>
              runAction(config?.paused ? "unpause" : "pause", () =>
                write(config?.paused ? "unpause" : "pause", [])
              )
            }
            className={`px-5 py-2 text-title-sm rounded-lg disabled:opacity-50 ${
              config?.paused ? "bg-success-green text-white" : "bg-error-crimson text-white"
            }`}
          >
            {busy === "pause" || busy === "unpause"
              ? "Confirming…"
              : config?.paused
                ? "Unpause Platform"
                : "Pause Platform"}
          </button>
        </div>

        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <div className="flex items-center gap-2 mb-3">
            <GearIcon width={16} height={16} className="text-research-teal" />
            <h2 className="text-title-sm text-trust-blue">Protocol Fee</h2>
          </div>
          <p className="text-body-sm text-on-surface-variant mb-3">
            Current: <strong className="text-trust-blue">{config ? config.protocol_fee_bps / 100 : "—"}%</strong> of
            every payout. Capped at 10%.
          </p>
          <div className="flex gap-2">
            <input
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              type="number"
              className="input"
              placeholder="bps, e.g. 150"
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                runAction("set_protocol_fee_bps", () =>
                  write("set_protocol_fee_bps", [Number(feeInput)])
                )
              }
              className="px-4 py-2 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "set_protocol_fee_bps" ? "Saving…" : "Update"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card mb-8">
        <h2 className="text-title-sm text-trust-blue mb-2">Accrued Protocol Fees</h2>
        <p className="text-body-sm text-on-surface-variant mb-4">
          Fees accumulate in the contract until swept into the owner's withdrawable balance, then a separate
          `withdraw_all()` call moves them into your wallet.
        </p>
        <button
          disabled={busy !== null}
          onClick={() => runAction("sweep_protocol_fees", () => write("sweep_protocol_fees", []))}
          className="px-5 py-2 bg-research-teal text-trust-blue text-title-sm rounded-lg disabled:opacity-50"
        >
          {busy === "sweep_protocol_fees" ? "Sweeping…" : "Sweep Fees to Owner Balance"}
        </button>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <h2 className="text-title-sm text-trust-blue mb-3">Policy Minimums</h2>
          <label className="text-label-xs text-on-surface-variant uppercase block mb-1">Min Premium (bps)</label>
          <div className="flex gap-2 mb-3">
            <input
              value={minPremiumInput}
              onChange={(e) => setMinPremiumInput(e.target.value)}
              type="number"
              className="input"
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                runAction("set_min_premium_bps", () =>
                  write("set_min_premium_bps", [Number(minPremiumInput)])
                )
              }
              className="px-4 py-2 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "set_min_premium_bps" ? "Saving…" : "Update"}
            </button>
          </div>
          <label className="text-label-xs text-on-surface-variant uppercase block mb-1">Min Coverage (wei)</label>
          <div className="flex gap-2">
            <input
              value={minCoverageInput}
              onChange={(e) => setMinCoverageInput(e.target.value)}
              type="text"
              className="input"
            />
            <button
              disabled={busy !== null}
              onClick={() =>
                runAction("set_min_coverage_wei", () =>
                  write("set_min_coverage_wei", [minCoverageInput])
                )
              }
              className="px-4 py-2 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "set_min_coverage_wei" ? "Saving…" : "Update"}
            </button>
          </div>
        </div>

        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <h2 className="text-title-sm text-trust-blue mb-3">Default Windows (seconds)</h2>
          <label className="text-label-xs text-on-surface-variant uppercase block mb-1">Accept Window</label>
          <input
            value={acceptWindowInput}
            onChange={(e) => setAcceptWindowInput(e.target.value)}
            type="number"
            className="input mb-3"
          />
          <label className="text-label-xs text-on-surface-variant uppercase block mb-1">Claim Grace</label>
          <input
            value={claimGraceInput}
            onChange={(e) => setClaimGraceInput(e.target.value)}
            type="number"
            className="input mb-3"
          />
          <button
            disabled={busy !== null}
            onClick={() =>
              runAction("set_default_windows", () =>
                write("set_default_windows", [Number(acceptWindowInput), Number(claimGraceInput)])
              )
            }
            className="px-4 py-2 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50"
          >
            {busy === "set_default_windows" ? "Saving…" : "Update Windows"}
          </button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-8">
        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <h2 className="text-title-sm text-trust-blue mb-3">Admin Roster</h2>
          <p className="text-body-sm text-on-surface-variant mb-3">
            Add or remove addresses allowed to pause/unpause and manage config. Only the owner can call this.
          </p>
          <div className="flex gap-2">
            <input
              value={adminAddrInput}
              onChange={(e) => setAdminAddrInput(e.target.value)}
              type="text"
              placeholder="0x…"
              className="input"
            />
            <button
              disabled={busy !== null || !adminAddrInput}
              onClick={() => runAction("add_admin", () => write("add_admin", [adminAddrInput]))}
              className="px-4 py-2 bg-research-teal text-trust-blue text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "add_admin" ? "Adding…" : "Add"}
            </button>
            <button
              disabled={busy !== null || !adminAddrInput}
              onClick={() => runAction("remove_admin", () => write("remove_admin", [adminAddrInput]))}
              className="px-4 py-2 bg-white border border-error-crimson text-error-crimson text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "remove_admin" ? "Removing…" : "Remove"}
            </button>
          </div>
        </div>

        <div className="bg-white border border-outline-variant rounded-xl p-5 ambient-card">
          <h2 className="text-title-sm text-trust-blue mb-3">Transfer Ownership</h2>
          <p className="text-body-sm text-on-surface-variant mb-3">
            Current owner: <strong className="text-trust-blue">{config?.owner}</strong>. This is irreversible —
            the new owner gains full control including future ownership transfer.
          </p>
          <div className="flex gap-2">
            <input
              value={newOwnerInput}
              onChange={(e) => setNewOwnerInput(e.target.value)}
              type="text"
              placeholder="0x…"
              className="input"
            />
            <button
              disabled={busy !== null || !newOwnerInput}
              onClick={() => {
                if (!confirm(`Transfer ownership to ${newOwnerInput}? This cannot be undone by you.`)) return;
                runAction("set_owner", () => write("set_owner", [newOwnerInput]));
              }}
              className="px-4 py-2 bg-error-crimson text-white text-title-sm rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "set_owner" ? "Transferring…" : "Transfer"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-outline-variant rounded-xl overflow-hidden">
        <h2 className="text-title-sm text-trust-blue p-5 pb-3">All Policies</h2>
        {policies?.map((p, i) => (
          <Link
            key={p.id}
            href={`/policies/${p.id}`}
            className={`flex items-center justify-between px-5 py-3 hover:bg-innovation-slate transition-colors ${
              i > 0 ? "border-t border-outline-variant" : ""
            }`}
          >
            <span className="text-body-sm text-trust-blue">
              #{p.id} · {p.project_title}
            </span>
            <StatusChip status={p.status} />
          </Link>
        ))}
        {policies?.length === 0 && (
          <p className="text-body-sm text-on-surface-variant p-5">No policies yet.</p>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-innovation-slate rounded-lg p-3 border border-outline-variant">
      <div className="text-label-xs text-on-surface-variant uppercase">{label}</div>
      <div className={`text-title-sm ${accent ?? "text-trust-blue"}`}>{value}</div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="max-w-md mx-auto px-6 py-24">
      <div className="bg-white border border-outline-variant rounded-xl p-8 ambient-card text-center">
        <div className="w-12 h-12 rounded-full bg-research-teal/15 text-research-teal flex items-center justify-center mx-auto mb-4">
          <ShieldIcon width={22} height={22} />
        </div>
        <h1 className="font-display text-headline-xs text-trust-blue mb-2">{title}</h1>
        {body && <p className="text-body-sm text-on-surface-variant">{body}</p>}
      </div>
    </div>
  );
}
