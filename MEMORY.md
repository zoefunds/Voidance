# Project Memory — Voidance

This file is the persistent memory for this project. Read it first in any
new session before making architectural or process decisions.

**Brand name: "Voidance"** (chosen 2026-07-27 over Failsafe/Riskproof/Nullwin
— a "void" research result still counts). Repo/folder/git remote stay named
`Innovation-Failure` (already created before renaming); the contract class
is `Voidance` (`contracts/innovation_failure_insurance.py`). Use "Voidance"
as the product name everywhere user-facing: logo wordmark, page titles,
nav bar, README title, favicon alt text.

## What this is

Decentralized insurance for research labs/startups/universities/innovation
funds. Sponsors fund a coverage pool for a research policy; a researcher
stakes a premium bond to accept it; if the milestone fails despite genuine,
rigorous, honestly-documented effort, the researcher is paid from coverage
instead of walking away with nothing. If it's negligence/fabrication, the
sponsor is refunded and the researcher's bond is forfeited.

Repo: https://github.com/zoefunds/Innovation-Failure.git

## Hard decisions already made (do not re-ask)

- **Backend DB**: PostgreSQL on Fly.io (Docker), not Supabase/Firebase.
- **Auth**: Wallet authentication (MetaMask/Rainbow/WalletConnect etc.), not
  email/password custodial wallets.
- **Backend host**: Fly.io, must run 24/7 ("never die") — use fly.toml with
  `min_machines_running >= 1`, restart policy, health checks.
- **Frontend host**: Vercel.
- **Contract deploy target**: GenLayer Studio / StudioNet. The user deploys
  the contract manually (CLI/Studio) and will paste the deployed contract
  address back into the conversation — do not attempt to deploy it yourself.
- **Git commits on this repo must NOT list Claude as a co-author/contributor.**
  Do not add "Co-Authored-By: Claude" to commits here (overrides the global
  default instruction for this project specifically).
- **Frontend typography**: user explicitly asked for *small* text, not the
  large Playfair Display headline sizes in the original HTML prototypes —
  scale down font sizes across landing/dashboard/claim pages relative to the
  prototype files while keeping the design system's colors/spacing/shape.

## Design source of truth

`/Users/macbook/Documents/design/Innovation-Failure/` — `DESIGN.md` (design
tokens: colors, type, spacing, shape) + four HTML prototypes (landing page,
submit-claim, claim-evaluation, user-dashboard). These are prototypes to
understand and reinterpret per section, not to copy-paste. Palette anchor:
Trust Blue `#0A2540`, Research Teal `#00D4FF`, Innovation Slate `#F6F9FC`.

## Contract design (contracts/innovation_failure_insurance.py)

~1,630 lines. Built from two working reference contracts the user provided
for escrow/value-transfer and web/image evaluation patterns:
- `/Users/macbook/Event-Weaver/contracts/event_weaver.py` — escrow ledger
  discipline (term vs. deposited fields), `_send_gen`/`_Recipient` EVM stub
  for real transfers to EOAs, `gl.eq_principle.prompt_comparative` tolerant
  consensus pattern.
- `/Users/macbook/Meme-olympics/contracts/meme_olympics.py` — error-prefix
  classification (EXPECTED/EXTERNAL/TRANSIENT/LLM_ERROR), audit logging,
  storage dataclass discipline (append-only fields).

Key properties, per the review team's rejection criteria:
- **Real value transfer**: `_send_gen` via `@gl.evm.contract_interface`
  stub is the only emission point; `gl.get_contract_at().emit_transfer()`
  does not settle to plain EOA wallets — confirmed by both reference repos.
- **Escrow ledger discipline**: `coverage_wei`/`premium_bps` are terms;
  `coverage_deposited`/`premium_deposited` are the actual ledger. Every
  settlement path zeroes the ledger and persists state BEFORE crediting
  balances (reentrancy/double-spend structurally impossible).
- **4 enumerated payout paths**: `evaluate_claim`→`_settle` (primary),
  `claim_sponsor_timeout` (nobody accepted), `claim_expired_no_claim`
  (accepted but no claim filed), `cancel_policy` (pre-acceptance sponsor
  cancel). No dead-fund state.
- **Contract-side web fetch, not text-only judging**: `_fetch_evidence` runs
  `gl.nondet.web.render` on the methodology URL + every claim evidence URL
  inside the leader closure. The LLM is never asked to rule on the
  claimant's narrative alone — review team rule #5.
- **Not too strict / avoids Undetermined**: `gl.eq_principle.prompt_comparative`
  principle only requires agreement within bands (`SCORE_TOLERANCE=18`,
  `CRITERION_TOLERANCE=20`, `CONFIDENCE_TOLERANCE=30`) and on `fraud_flag`;
  wording/snapshot differences are explicitly irrelevant. This avoids
  spurious leader rotation while still catching materially wrong verdicts.
- Reference: https://skills.genlayer.com/ and https://docs.genlayer.com/ —
  used for `gl.public.write.payable`, `gl.message.value`, `gl.nondet.web`,
  `gl.eq_principle.prompt_comparative`, `TreeMap`/`DynArray`/`@allow_storage`
  storage patterns.
- `genvm-lint` was not installed locally (pip environment is externally
  managed on this Mac) — only `ast.parse` syntax validation was run. Run
  `genvm-lint check contracts/innovation_failure_insurance.py --json` before
  deploying if the tool becomes available, per the user's reference brief.

## Redis (Upstash)

User supplied an Upstash Redis URL for the backend:
`rediss://default:***@optimum-jaguar-161919.upstash.io:6379` (the actual
secret is in the user's message history / Fly secrets — never hardcode it
into a committed file; it's only referenced via `REDIS_URL` env var, wired
into `backend/src/redis.ts`). Used for: (1) short-TTL response cache on
`/api/policies` and `/api/stats` (8-10s), (2) `rate-limit-redis` store for
`express-rate-limit` so limits survive restarts / multi-machine scale-out.
It is optional infra — `redis.ts` degrades to direct-Postgres reads and an
in-memory rate limiter if `REDIS_URL` is unset, so a Redis outage never
takes the "never dies" backend down.

## Repo

Renamed to https://github.com/zoefunds/Voidance.git (was Innovation-Failure).

## Deployed contract

- **Voidance contract address (GenLayer StudioNet)**: `0x58dED66906Ceb587236591C5d9729CE89501cbC2`
  (deployed by the user via GenLayer Studio, constructor args:
  min_coverage_wei=0, min_premium_bps=300, protocol_fee_bps=150,
  owner_address=blank → owner is the deploying wallet).

## Build/install verification (2026-07-27)

All package versions originally written into `package.json` files were
guessed and several didn't exist on npm (`genlayer-js@0.7.4` in particular
— real latest is `1.2.0`). Corrected every dependency to versions confirmed
to exist via `npm view`, then actually ran installs/builds instead of just
writing code:
- **Backend**: `npm install` ✅, `tsc --noEmit` ✅ (fixed real type errors:
  `pino-http` needs the named import `{ pinoHttp }`, `ioredis` needs
  `{ Redis }` named import under NodeNext resolution, `genlayer-js`
  `readContract` doesn't accept a `stateStatus` option in v1.2.0's types,
  `rate-limit-redis`'s `sendCommand` needs a locally-captured non-null
  redis binding to narrow properly inside the closure), `npm run build` ✅.
  **Ran the compiled server against a throwaway local Postgres container**
  (migration applied cleanly) and hit `/health`, `/api/policies`,
  `/api/stats` — `/api/stats` successfully read `get_platform_stats` live
  from the real deployed contract at `0x58dED66906Ceb587236591C5d9729CE89501cbC2`
  on StudioNet via `genlayer-js`, confirming the read path is real and
  working, not just type-checked.
- **Frontend**: `npm install` ✅, `tsc --noEmit` ✅ (fixed real type errors:
  wagmi's ABI `uint256` args need `bigint`, not `number` — every
  `writeContractAsync` call site now wraps ids/timestamps in `BigInt(...)`),
  `next build` ✅ after adding webpack aliases in `next.config.mjs` to stub
  out `@x402/*` modules pulled in transitively by RainbowKit's Coinbase
  "Base Account" connector (optional, unused, would otherwise fail the
  build) and `@react-native-async-storage/async-storage` / `pino-pretty`
  (optional deps of WalletConnect/pino, browser-irrelevant).
- Used `next@14`/`react@18`/`wagmi@2`/`tailwindcss@3` majors deliberately,
  not the newest available (`next@16`/`react@19`/`wagmi@3`/`tailwindcss@4`)
  — those are recent major bumps with breaking API/config changes (Tailwind
  4 in particular drops the JS config file format this project uses) that
  weren't worth the risk under this session's time budget. Revisit only
  with a deliberate upgrade pass, not incidentally.

## Known integration risk — verify before shipping writes

`frontend/lib/contract.ts` defines a standard EVM ABI and `frontend/app/policies/[id]/page.tsx`
calls it via wagmi's `useWriteContract` (MetaMask/RainbowKit signs directly).
This assumes GenLayer StudioNet exposes an EVM-JSON-RPC-compatible path for
calling `@gl.public.write` functions with plain ABI-encoded calldata. The
backend instead uses `genlayer-js`'s own `client.writeContract` /
`createAccount` pattern (confirmed against the real genlayer-js README, see
below), which is GenLayer's native, confirmed-correct way to sign and submit
a transaction. **Before wiring the "Accept Policy" / "Submit Claim" /
"Evaluate Claim" buttons for real, verify with a live StudioNet transaction
whether wagmi's direct ABI call path actually works against a GenLayer IC.**
If it doesn't, replace the wagmi `useWriteContract` calls in
`app/policies/[id]/page.tsx` with `genlayer-js`'s `client.writeContract`,
using the connected wallet's EIP-1193 provider (`window.ethereum` from
wagmi's `useConnectorClient`) as the signing account instead of
`createAccount()` (which is for raw-private-key accounts, not browser
wallets) — genlayer-js is built on viem, so a viem `Account`/`WalletClient`
adapter from the injected provider should be accepted directly.

Confirmed real `genlayer-js` API (fetched from the actual GitHub README,
package `genlayer-js`, chains export includes `localnet`/`studionet`):
```ts
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const client = createClient({ chain: studionet });
await client.readContract({ address, functionName, args, stateStatus: "accepted" });
await client.writeContract({ account, address, functionName, args, value });
```

## Open follow-ups / next steps for future sessions

- [x] Get deployed contract address from user; wire into backend config.
- [ ] Finish backend (Fastify/Express + Postgres on Fly.io), wallet auth,
      GenLayer JSON-RPC relay service, health checks.
- [ ] Finish frontend (Next.js on Vercel): landing, dashboard, submit-claim,
      claim-evaluation/review, policy detail, admin — small body text per
      user correction, using logo at `frontend/public/logo.svg` /
      `favicon.svg`.
- [ ] Database schema/migrations mirroring contract state (policies, claims,
      evaluations, users/wallets, activity log) for fast querying — contract
      remains the source of truth for money movement.
- [ ] fly.toml with `min_machines_running = 1`+ auto-restart for 24/7 backend.
- [ ] Do not add Claude as commit co-author on this repo.
