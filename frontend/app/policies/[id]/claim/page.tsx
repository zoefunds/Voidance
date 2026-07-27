"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useVoidanceWallet } from "@/lib/genlayerWallet";
import { UploadCloudIcon, DocumentIcon } from "@/components/Icons";

// Next.js 14 App Router passes `params` as a plain object, not a Promise.
export default function SubmitClaimPage({ params }: { params: { id: string } }) {
  const policyId = Number(params.id);
  const router = useRouter();
  const { write } = useVoidanceWallet();

  const [narrative, setNarrative] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState(["", ""]);
  const [step, setStep] = useState(1);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateUrl(i: number, value: string) {
    setEvidenceUrls((prev) => prev.map((u, idx) => (idx === i ? value : u)));
  }

  async function handleSubmit() {
    const urls = evidenceUrls.map((u) => u.trim()).filter(Boolean);
    setError(null);
    setIsPending(true);
    try {
      await write("submit_claim", [policyId, narrative, JSON.stringify(urls), Math.floor(Date.now() / 1000)]);
      router.push(`/policies/${policyId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "transaction failed");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 md:px-10 py-10">
      <h1 className="font-display text-headline-xs text-trust-blue mb-1">
        Submit Innovation Failure Claim
      </h1>
      <p className="text-body-sm text-on-surface-variant mb-8">
        Policy #{policyId} · validators will fetch every evidence URL below directly — nothing
        here is taken at your word alone.
      </p>

      <div className="flex items-center gap-2 mb-6">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-label-xs font-bold ${
              step >= s ? "bg-trust-blue text-white" : "bg-surface-container-high text-on-surface-variant"
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      {error && <p className="text-body-sm text-error-crimson mb-4">{error}</p>}

      <div className="bg-white border border-outline-variant rounded-xl p-6 ambient-card">
        {step === 1 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <DocumentIcon width={18} height={18} className="text-research-teal" />
              <span className="text-title-sm text-trust-blue">Point of Failure</span>
            </div>
            <label className="block text-label-xs text-on-surface-variant mb-1.5">
              What happened — the point of failure
            </label>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              rows={6}
              maxLength={5000}
              className="w-full bg-white border border-outline-variant rounded-lg p-3 text-body-sm focus:ring-2 focus:ring-research-teal/50 focus:border-research-teal outline-none"
              placeholder="Detail the specific point of failure and how it deviates from the insured milestone..."
            />
            <button
              onClick={() => setStep(2)}
              disabled={narrative.trim().length === 0}
              className="mt-4 px-5 py-2 bg-research-teal text-trust-blue text-title-sm rounded-lg disabled:opacity-40"
            >
              Continue
            </button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <UploadCloudIcon width={18} height={18} className="text-research-teal" />
              <span className="text-title-sm text-trust-blue">Independent Evidence</span>
            </div>
            <label className="block text-label-xs text-on-surface-variant mb-1.5">
              Evidence URLs (datasets, repos, lab notebooks, third-party logs)
            </label>
            <div className="flex flex-col gap-2 mb-3">
              {evidenceUrls.map((u, i) => (
                <input
                  key={i}
                  value={u}
                  onChange={(e) => updateUrl(i, e.target.value)}
                  className="w-full bg-white border border-outline-variant rounded-lg p-2.5 text-body-sm focus:ring-2 focus:ring-research-teal/50 focus:border-research-teal outline-none"
                  placeholder="https://..."
                />
              ))}
            </div>
            <button
              onClick={() => setEvidenceUrls((prev) => [...prev, ""])}
              className="text-body-sm text-research-teal hover:underline mb-4"
            >
              + Add another URL
            </button>
            <div className="flex justify-between border-t border-outline-variant pt-4">
              <button onClick={() => setStep(1)} className="px-5 py-2 border border-trust-blue text-trust-blue text-title-sm rounded-lg">
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending || evidenceUrls.every((u) => !u.trim())}
                className="px-5 py-2 bg-success-green text-white text-title-sm rounded-lg disabled:opacity-40"
              >
                {isPending ? "Submitting…" : "Submit Claim"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
