const STEPS = [
  {
    title: "1. Sponsor funds a policy",
    body: "A sponsor (grant fund, university, DAO) deposits real GEN as coverage for a specific research milestone, and sets the methodology document that will be checked later.",
  },
  {
    title: "2. Researcher accepts & stakes",
    body: "The researcher stakes a premium bond (a % of coverage) to accept the terms — an anti-fraud commitment, fully refunded on any honest outcome.",
  },
  {
    title: "3. Milestone fails, claim is filed",
    body: "If the milestone doesn't succeed, the researcher files a claim with a narrative plus independent evidence URLs — data, repos, third-party logs.",
  },
  {
    title: "4. Validators fetch evidence & score rigor",
    body: "GenLayer validators independently fetch the methodology document and every evidence URL, score five rigor criteria, and reach tolerant consensus on a verdict.",
  },
  {
    title: "5. On-chain settlement",
    body: "PASS pays full coverage to the researcher; PARTIAL prorates it; FAIL (negligence/fabrication) refunds the sponsor and forfeits the researcher's bond. All real GEN transfers.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 md:px-10 py-14">
      <h1 className="font-display text-headline-xs text-trust-blue mb-2">How Voidance Works</h1>
      <p className="text-body-sm text-on-surface-variant mb-10">
        Voidance doesn&apos;t insure success — it insures genuine, rigorous effort. The verdict is
        never taken from a claimant's word alone; it comes from validator consensus over evidence
        the contract fetches itself.
      </p>
      <div className="flex flex-col gap-6">
        {STEPS.map((s) => (
          <div key={s.title} className="border-l-2 border-research-teal pl-4">
            <h2 className="text-title-sm text-trust-blue mb-1">{s.title}</h2>
            <p className="text-body-sm text-on-surface-variant">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
