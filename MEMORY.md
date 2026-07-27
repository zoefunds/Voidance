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

## Redis — added, then removed by explicit request (2026-07-27)

User initially supplied an Upstash Redis URL, which was wired in for a
short-TTL response cache on `/api/policies`/`/api/stats` and a
`rate-limit-redis` store. User then asked to **cut Redis usage entirely to
avoid outage risk** and reconfirmed the backend must never die. Since the
original Redis wiring was already fail-open (degraded to direct Postgres /
in-memory on any Redis error), removing it wasn't fixing a bug — it was
honoring an explicit preference for a smaller dependency surface: Postgres
is now the *only* external dependency the backend has, which is the
simplest version of "never dies" achievable. Removed: `backend/src/redis.ts`
(deleted), `cacheGet`/`cacheSet` calls in `routes/policies.ts`/`routes/stats.ts`
(reverted to plain Postgres queries), the `RedisStore` rate-limit backing in
`src/app.ts` (now a plain in-memory `express-rate-limit`, which resets on
restart — an accepted trade), `ioredis`/`rate-limit-redis` deps, `REDIS_URL`
from env schema/`.env.example`/Fly secrets. **Do not re-add Redis unless the
user asks again.**

## Repo

Renamed to https://github.com/zoefunds/Voidance.git (was Innovation-Failure).

## Deployed contract

- **Voidance contract address (GenLayer StudioNet)**: `0x58dED66906Ceb587236591C5d9729CE89501cbC2`
  (deployed by the user via GenLayer Studio, constructor args:
  min_coverage_wei=0, min_premium_bps=300, protocol_fee_bps=150,
  owner_address=blank → owner is the deploying wallet).

## Automated tests (2026-07-27)

Three real suites now exist and all pass — none are stubs:

- **`tests/contract/test_voidance.py`** (15 tests, `genlayer-test` Direct
  Mode — runs the actual contract in-memory against the real pinned GenVM
  SDK, `mock_web`/`mock_llm` standing in for nondet calls). Covers the full
  escrow lifecycle: coverage locking, exact-premium enforcement, all 4
  payout paths (settle PASS/PARTIAL/FAIL, sponsor timeout, no-claim
  timeout, cancellation), and admin controls — with real balance
  assertions after each settlement, not just status-string checks.
  Run: `pip install genlayer-test && pytest tests/contract -v` (needs
  Python 3.12/3.13 — see the sub-bullet below on a 3.14 red herring, and
  the "stray genlayer/ directory" bug this session hit and fixed).
  **CRITICAL FOOTGUN, already fixed once, do not reintroduce**: never create
  a directory literally named `genlayer` anywhere under this repo root.
  Python's implicit namespace-package resolution will silently shadow the
  real GenVM SDK package with an empty stub the moment pytest (or anything
  else) runs with the repo root on `sys.path`, producing a baffling
  `NameError: name 'allow_storage' is not defined` deep inside gltest's
  loader that has nothing to do with your code. This exact bug cost real
  session time before being traced to an empty `genlayer/` folder created
  by an early `mkdir -p {...,genlayer,...}` scaffolding command (the
  original README's suggested top-level folder list included `genlayer/`
  — don't take that literally as a directory name; the contract already
  lives in `contracts/`).
  - Initially suspected (WRONG, ruled out by testing in a clean Python 3.13
    venv with the same result): Python 3.14 incompatibility, pip stub
    package (`pip install genlayer` installs an intentionally-empty
    placeholder — uninstall it if present, but it wasn't the real cause
    either).
- **`backend/tests/api.test.ts`** (11 tests, Node's built-in test runner +
  supertest, against a real throwaway Postgres container — not mocked).
  Required extracting `backend/src/app.ts` (Express app factory) out of
  `index.ts` (bootstrap: listen + sync loop + signal handlers) purely for
  testability — `index.ts` now just wires `createApp()` up to a port.
  Run: `docker run -d --name voidance-pg-test -e POSTGRES_USER=voidance -e
  POSTGRES_PASSWORD=voidance -e POSTGRES_DB=voidance_test -p 5442:5432
  postgres:16-alpine`, then `npm test` from `backend/`.
- **Frontend**: no separate unit-test suite — instead verified via live
  browser checks (Claude_Browser tools) against the actual Vercel
  production deployment for every page, plus `tsc --noEmit` + `next build`
  gating every deploy. Judged sufficient given the app is thin (mostly data
  display + wallet-signed writes) and the real integration points (backend
  API, GenLayer contract) are what matter, both of which ARE covered.

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

## RESOLVED — frontend write path now uses genlayer-js, not a guessed ABI

Originally the frontend called write functions via wagmi's `useWriteContract`
against a hand-written EVM ABI — an unverified guess about StudioNet's
transaction format. Fixed properly (2026-07-27) instead of testing-and-hoping:
inspected genlayer-js 1.2.0's actual shipped type definitions
(`node_modules/genlayer-js/dist/index.d.ts`) and confirmed `createClient`
takes `{ chain, account: Address, provider: EthereumProvider }` — i.e. it
natively supports signing through any EIP-1193 provider, which is exactly
what a connected browser wallet exposes. `frontend/lib/genlayerWallet.ts`
(`useVoidanceWallet` hook) gets that raw provider via wagmi's own documented
`connector.getProvider()`, builds a `genlayer-js` client from it per write
call, and calls `client.writeContract(...)` — genlayer-js's own transaction
encoding, not a generic ABI guess. All three write pages
(`app/policies/new`, `app/policies/[id]`, `app/policies/[id]/claim`) were
rewired to this hook; `frontend/lib/contract.ts`'s dead ABI export was
deleted. Typechecked and built clean end to end.

Residual (unavoidable without live funds): still not tested against a real
signed StudioNet transaction, since that requires the user's own funded
wallet — but the implementation now matches genlayer-js's actual documented
API rather than an assumption, which is the correct fix regardless.

Confirmed real `genlayer-js` API (fetched from the actual GitHub README,
package `genlayer-js`, chains export includes `localnet`/`studionet`):
```ts
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
const client = createClient({ chain: studionet });
await client.readContract({ address, functionName, args, stateStatus: "accepted" });
await client.writeContract({ account, address, functionName, args, value });
```

## First real on-chain test — bug found and fixed (2026-07-27)

User created a real policy through the live frontend (`/policies/new`) —
**it worked**: policy #0 landed on-chain with real GEN, confirming the
`genlayer-js` wallet-signing fix (see above) is genuinely correct, not just
type-checked. Clicking into the policy detail page then crashed with
"Application error: a client-side exception has occurred" — console showed
minified React error #438 (`use()` called on something that isn't a
Promise/Context). Root cause: `app/policies/[id]/page.tsx` and
`app/policies/[id]/claim/page.tsx` used the **Next.js 15** pattern
(`params: Promise<{id: string}>` + `const {id} = use(params)`), but this
project runs **Next.js 14.2**, where `params` is a plain synchronous object
— calling `use()` on it throws. Fixed by reverting both to the Next 14
signature (`{ params }: { params: { id: string } }`, use `params.id`
directly, no `use()` import). Verified fixed against the real policy #0 in
a fresh browser tab post-deploy. **If any other dynamic route page is added
later, use the Next 14 plain-object params pattern, not Next 15's.**

## Admin console + WalletConnect (2026-07-27)

- `frontend/app/admin/page.tsx` — gated by `is_admin(address)` read via
  `frontend/lib/genlayerRead.ts` (a plain unsigned `genlayer-js` read
  client — views don't need a wallet). Shows platform stats, pause/unpause,
  protocol fee update, fee sweep, and a full policy list. All actions route
  through `useVoidanceWallet().write` (real signed transactions).
- Real WalletConnect Cloud project ID (`91b9e60f61c44317e38ce4c5e348662b`)
  set as `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` on Vercel, replacing the
  `voidance-dev` placeholder — the user created the WalletConnect account
  themselves (Claude cannot sign up for third-party accounts on the user's
  behalf) and handed the ID over.
- `docs/TESTING.md` — step-by-step end-to-end test script with exact
  contract-call parameter values (real, always-reachable evidence URLs) for
  manually walking a real policy through create → accept → claim →
  evaluate → withdraw with real GEN on StudioNet. Not yet executed by
  anyone — this remains the one true unverified path (see "Known
  integration risk" section above, now partially addressed by the
  genlayer-js wallet fix but still never tested against a live signed tx).

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
