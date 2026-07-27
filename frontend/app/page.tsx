import Link from "next/link";

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="px-6 md:px-10 py-16 md:py-20 bg-innovation-slate">
        <div className="max-w-6xl mx-auto grid md:grid-cols-12 gap-8 items-center">
          <div className="md:col-span-7">
            <span className="inline-block px-2.5 py-1 bg-research-teal/15 text-trust-blue text-label-xs rounded mb-3">
              DECENTRALIZED RISK MITIGATION
            </span>
            <h1 className="font-display text-display-sm text-trust-blue mb-3 leading-tight">
              Insurance for research that fails <span className="italic">honestly</span>
            </h1>
            <p className="text-body-sm text-on-surface-variant mb-6 max-w-lg">
              Voidance covers rigorous, well-documented research efforts even when the
              outcome doesn&apos;t work out. GenLayer validators verify the real evidence
              — not just your word for it — and settle payouts on-chain.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/policies/new"
                className="px-5 py-2.5 bg-research-teal text-trust-blue text-title-sm rounded-lg ambient-card hover:bg-research-teal/80 transition-colors"
              >
                Fund a Policy
              </Link>
              <Link
                href="/how-it-works"
                className="px-5 py-2.5 border-2 border-research-teal text-trust-blue text-title-sm rounded-lg hover:bg-research-teal/5 transition-colors"
              >
                How it Works
              </Link>
            </div>
          </div>
          <div className="md:col-span-5">
            <div className="glass-card p-4 rounded-xl ambient-card rotate-1">
              <div className="flex items-center justify-between mb-3 border-b border-outline-variant pb-2">
                <span className="text-label-xs text-trust-blue uppercase tracking-wider">
                  Policy #0042
                </span>
                <span className="text-success-green text-label-xs">● VERIFIED</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="bg-innovation-slate p-2.5 rounded">
                  <div className="text-[9px] text-on-surface-variant uppercase">Coverage</div>
                  <div className="text-title-sm text-trust-blue">18,000 GEN</div>
                </div>
                <div className="bg-innovation-slate p-2.5 rounded">
                  <div className="text-[9px] text-on-surface-variant uppercase">Rigor Score</div>
                  <div className="text-title-sm text-research-teal">82 / 100</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 md:px-10 py-16 bg-white border-y border-outline-variant">
        <div className="max-w-6xl mx-auto">
          <h2 className="font-display text-headline-xs text-trust-blue mb-8 text-center">
            How the coverage decision is made
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              ["1", "Fund a Policy", "A sponsor deposits real GEN as coverage for a research milestone."],
              ["2", "Researcher Commits", "The researcher stakes a premium bond, accepting the terms."],
              ["3", "Claim + Evidence", "If the milestone fails, the researcher files a claim with evidence URLs."],
              ["4", "Validator Consensus", "GenLayer validators fetch the evidence, score rigor, and settle payout on-chain."],
            ].map(([n, title, body]) => (
              <div key={n} className="flex flex-col gap-2">
                <div className="w-7 h-7 rounded-full bg-trust-blue text-white flex items-center justify-center text-label-xs font-bold">
                  {n}
                </div>
                <h3 className="text-title-sm text-trust-blue">{title}</h3>
                <p className="text-body-sm text-on-surface-variant">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Live evaluation feed */}
      <section className="px-6 md:px-10 py-16 bg-innovation-slate">
        <div className="max-w-3xl mx-auto bg-white border border-outline-variant rounded-xl p-6 ambient-card relative">
          <div className="absolute -top-3 -right-3 bg-research-teal text-trust-blue px-3 py-1 rounded text-label-xs font-bold">
            LIVE
          </div>
          <h3 className="text-headline-xs font-display text-trust-blue mb-1">
            Verdict: Coverage Approved
          </h3>
          <p className="text-body-sm text-on-surface-variant mb-4">
            Policy #0042 · Quantum Resilience Study
          </p>
          <div className="bg-trust-blue/5 border-l-4 border-research-teal p-4 text-code-xs text-on-surface-variant leading-relaxed font-mono">
            <p>fetching methodology_url... 200 OK</p>
            <p>fetching evidence[0..2]... 2/3 reachable</p>
            <p>criteria.methodology_rigor = 84, independent_evidence = 71</p>
            <p className="text-trust-blue font-semibold">verdict: PASS · payout_bps = 10000</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 md:px-10 py-16">
        <div className="max-w-2xl mx-auto glass-card p-8 rounded-xl text-center ambient-card border border-research-teal/20">
          <h2 className="font-display text-headline-xs text-trust-blue mb-2">
            Ready to insure ambitious research?
          </h2>
          <p className="text-body-sm text-on-surface-variant mb-6">
            Join sponsors and researchers using Voidance to de-risk genuine scientific effort.
          </p>
          <div className="flex flex-col md:flex-row justify-center gap-3">
            <Link href="/policies/new" className="px-6 py-2.5 bg-trust-blue text-white text-title-sm rounded-lg">
              Fund a Policy Now
            </Link>
            <Link href="/policies" className="px-6 py-2.5 border border-outline text-trust-blue text-title-sm rounded-lg">
              Browse Open Policies
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
