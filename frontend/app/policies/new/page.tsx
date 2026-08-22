"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { parseEther } from "viem";
import { useVoidanceWallet } from "@/lib/genlayerWallet";

export default function NewPolicyPage() {
  const router = useRouter();
  const { write } = useVoidanceWallet();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    title: "",
    description: "",
    field: "",
    methodologyUrl: "",
    methodologySummary: "",
    milestone: "",
    coverage: "",
    premiumBps: "300",
    deadline: "",
    approvedEvidenceDomains: "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const deadlineTs = Math.floor(new Date(form.deadline).getTime() / 1000);
    const approvedDomains = form.approvedEvidenceDomains
      .split(",")
      .map((d) => d.trim().toLowerCase())
      .filter(Boolean);
    setError(null);
    setIsPending(true);
    try {
      await write(
        "create_policy",
        [
          form.title,
          form.description,
          form.field,
          form.methodologyUrl,
          form.methodologySummary,
          form.milestone,
          "[]",
          deadlineTs,
          Number(form.premiumBps),
          0,
          0,
          JSON.stringify(approvedDomains),
        ],
        parseEther(form.coverage || "0")
      );
      router.push("/policies");
    } catch (err) {
      setError(err instanceof Error ? err.message : "transaction failed");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-10 py-10">
      <h1 className="font-display text-headline-xs text-trust-blue mb-1">Fund a Research Policy</h1>
      <p className="text-body-sm text-on-surface-variant mb-8">
        Attach real GEN as coverage. It sits in escrow in the Voidance contract until a claim is
        settled or the policy expires/cancels.
      </p>

      <form onSubmit={handleSubmit} className="bg-white border border-outline-variant rounded-xl p-6 ambient-card flex flex-col gap-4">
        <Field label="Project title">
          <input required value={form.title} onChange={(e) => set("title", e.target.value)} className="input" />
        </Field>
        <Field label="Project description">
          <textarea required rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} className="input" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Research field">
            <input required value={form.field} onChange={(e) => set("field", e.target.value)} className="input" placeholder="e.g. Materials Science" />
          </Field>
          <Field label="Milestone deadline">
            <input required type="datetime-local" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} className="input" />
          </Field>
        </div>
        <Field label="Public methodology document URL">
          <input required type="url" value={form.methodologyUrl} onChange={(e) => set("methodologyUrl", e.target.value)} className="input" placeholder="https://..." />
        </Field>
        <Field label="Methodology summary">
          <textarea rows={2} value={form.methodologySummary} onChange={(e) => set("methodologySummary", e.target.value)} className="input" />
        </Field>
        <Field label="Insured milestone">
          <textarea required rows={2} value={form.milestone} onChange={(e) => set("milestone", e.target.value)} className="input" />
        </Field>
        <Field label="Approved evidence domains (optional)">
          <input
            value={form.approvedEvidenceDomains}
            onChange={(e) => set("approvedEvidenceDomains", e.target.value)}
            className="input"
            placeholder="e.g. arxiv.org, github.com — comma-separated"
          />
          <span className="text-label-xs text-on-surface-variant mt-1">
            If set, the researcher's claim evidence URLs must resolve to one of these domains, or the
            claim is rejected outright. Leave blank to accept evidence from any domain (default).
          </span>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Coverage (GEN)">
            <input required type="number" step="0.0001" value={form.coverage} onChange={(e) => set("coverage", e.target.value)} className="input" />
          </Field>
          <Field label="Required researcher premium (bps)">
            <input required type="number" value={form.premiumBps} onChange={(e) => set("premiumBps", e.target.value)} className="input" />
          </Field>
        </div>
        {error && <p className="text-body-sm text-error-crimson">{error}</p>}
        <button type="submit" disabled={isPending} className="mt-2 px-5 py-2.5 bg-trust-blue text-white text-title-sm rounded-lg disabled:opacity-50">
          {isPending ? "Confirming in wallet…" : "Fund Policy"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-label-xs text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}
