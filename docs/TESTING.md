# End-to-End Test Guide — Voidance on StudioNet

This walks through the full escrow lifecycle with **real GEN and two
wallets** against the live deployed contract:

```
0x9a6bCe6a759c6E9ca20d90ca593B759CfC5E4f77
```

You need **two funded StudioNet accounts** — one plays the sponsor, one
plays the researcher (a single account can't fill both roles: the contract
explicitly rejects `sponsor == researcher` in `accept_policy`).

## 0. Setup

1. **Sponsor account**: the same wallet you used to deploy the contract in
   GenLayer Studio already has StudioNet GEN (you paid deploy gas with it) —
   use that one as the sponsor.
2. **Researcher account**: create/import a second address. If GenLayer
   Studio doesn't show an obvious faucet button in its UI, the fastest path
   is: open Studio, switch to your second account, and check for a "Fund
   Account" / faucet action in the account panel — StudioNet accounts are
   typically pre-funded or one click away from being funded inside Studio
   itself. (I couldn't confirm the exact faucet UI copy from GenLayer's
   public docs — if you don't see one, ask in GenLayer's Discord
   https://discord.gg/8Jm4v89VAu, they're responsive.)

Two ways to run the flow below — pick whichever is easier:

- **Path A (most reliable): GenLayer Studio's own "Interact" panel** — the
  same place you clicked "Deploy Voidance.py". Load the deployed contract
  at the address above, and call each function directly with the exact
  values below. This is proven to work since you already used it to deploy.
- **Path B: the live frontend** at https://voidance-delta.vercel.app — uses
  `genlayer-js`'s wallet-signing path (see MEMORY.md). This has NOT yet
  been confirmed against a real signed StudioNet transaction. If a button
  errors, fall back to Path A for that step and tell me what broke so I can
  fix the frontend.

## 1. Sponsor: `create_policy` (payable)

Call as the **sponsor** account. Attach value = the coverage amount.

| Field | Value |
|---|---|
| `project_title` | `Quantum Decoherence Resilience Study` |
| `project_description` | `Testing whether a novel qubit shielding design extends coherence time by 100x under lab conditions.` |
| `research_field` | `Physics` |
| `methodology_url` | `https://raw.githubusercontent.com/genlayerlabs/genvm/main/README.md` |
| `methodology_summary` | `Pre-registered double-blind protocol comparing shielded vs unshielded qubit arrays.` |
| `milestone_description` | `Demonstrate at least 50x improvement in coherence time over the unshielded baseline.` |
| `tags_json` | `["quantum","hardware"]` |
| `milestone_deadline_ts` | a unix timestamp ~1 hour from now — e.g. run `date -v+1H +%s` (macOS) or `date -d '+1 hour' +%s` (Linux) |
| `premium_bps` | `300` (3%) |
| `accept_window_seconds` | `0` (use platform default, 30 days) |
| `claim_grace_seconds` | `0` (use platform default, 60 days) |
| `approved_evidence_domains_json` | `[]` (no restriction — evidence can come from any domain; set e.g. `["arxiv.org"]` to require the researcher's evidence URLs resolve to that domain, or the claim is rejected outright) |
| **value attached** | `1000000000000000000` (1 GEN, in wei) — use less if you want a smaller test, just keep it a round number so the math is easy to eyeball |

**Note on `methodology_url`**: it must be a real, publicly fetchable URL —
validators actually fetch it during `evaluate_claim`. The GitHub raw README
link above is a real, always-reachable public page, good for testing.

This returns a `policy_id` — **write it down**, e.g. `0`.

## 2. Researcher: `accept_policy` (payable)

Call as the **researcher** account (must differ from the sponsor).

First call the view `quote_required_premium(policy_id)` to get the exact
wei you must attach — with the values above it will be `30000000000000000`
(3% of 1 GEN). Attach **exactly** that value, not more, not less — the
contract rejects any mismatch.

| Field | Value |
|---|---|
| `policy_id` | the id from step 1 |
| **value attached** | exactly the result of `quote_required_premium` |

Check `get_policy(policy_id)` afterward — `status` should now be `ACTIVE`
and `researcher` should be your researcher address.

## 3. Researcher: `submit_claim`

Still the **researcher** account, no value attached.

| Field | Value |
|---|---|
| `policy_id` | the id from step 1 |
| `claim_narrative` | `Despite following the pre-registered shielding protocol exactly, coherence time only improved 12x, short of the 50x target. Environmental vibration noise in the lab exceeded the isolation budget in the original design.` |
| `evidence_urls_json` | `["https://raw.githubusercontent.com/genlayerlabs/genvm/main/README.md","https://en.wikipedia.org/wiki/Quantum_decoherence"]` |

Both evidence URLs above are real, publicly reachable pages — good for a
first test since you're checking that the plumbing works, not tuning for a
specific verdict. Check `get_policy(policy_id)` — `status` should now be
`CLAIM_SUBMITTED`.

## 4. Anyone: `evaluate_claim` (permissionless)

Either account can call this — resolution is trustless by design. No value
attached.

| Field | Value |
|---|---|
| `policy_id` | the id from step 1 |

**This is the slow step**: GenLayer validators actually fetch both URLs and
run an LLM adjudication pass under `gl.eq_principle.prompt_comparative` —
expect it to take longer than a normal write (consensus + nondet work).

When it resolves, check `get_policy(policy_id)`:
- `status` will be `SETTLED_PASS`, `SETTLED_PARTIAL`, or `SETTLED_FAIL`
  (or, if validator confidence came back below the 45% floor, it stays
  `CLAIM_SUBMITTED` and you can call `evaluate_claim` again later — this is
  intentional, see `MIN_ACTIONABLE_CONFIDENCE` in the contract).
- `verdict`, `total_score`, `confidence`, `payout_bps`, `evaluation_summary`
  are all filled in with the real validator reasoning.

## 5. Both accounts: `withdraw_all`

Settlement **credits an internal balance** — it does not push GEN to your
wallet automatically (see the escrow design in MEMORY.md: zero-then-credit,
then a separate explicit transfer). Check your credited balance first:

```
get_balance_of("<your address>")
```

Then, as **each** account that has a nonzero balance, call `withdraw_all()`
(no args, no value) to actually receive the GEN in your wallet. This is the
real on-chain value transfer — check your wallet balance changed.

## What "success" looks like

- Sponsor's and researcher's wallet balances actually change after
  `withdraw_all()` — not just internal contract state.
- `get_activity(policy_id)` shows the full event trail: `CREATE`, `ACCEPT`,
  `CLAIM_SUBMITTED`, `SETTLED`.
- `get_evaluation_history(policy_id)` shows the adjudication record with
  real reasoning text from the LLM, not a placeholder.

## If something breaks

Tell me exactly which step failed and the exact error text. If it's Path B
(the frontend) failing where Path A (Studio) succeeds for the same call,
that confirms the `genlayer-js` wallet-signing integration needs a fix —
see the "Known integration risk" section in `MEMORY.md`.
