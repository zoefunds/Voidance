# Voidance

Decentralized insurance for research labs, startups, universities, and
innovation funds. Voidance covers genuine, rigorous research efforts that
fail despite honest, well-documented work — adjudicated on-chain by GenLayer
validator consensus over real, contract-fetched evidence, with actual GEN
value transfer, not a synthetic points system.

See [`MEMORY.md`](MEMORY.md) for the full project history, hard decisions,
and open follow-ups — read it first before making architectural changes.

## Live

- **App**: https://voidance-delta.vercel.app
- **Backend API**: https://voidance-backend.fly.dev (`/health`, `/api/policies`, `/api/stats`, `/api/wallets/:address/policies`)
- **Contract**: `0x58dED66906Ceb587236591C5d9729CE89501cbC2` on GenLayer StudioNet
- **Admin console**: https://voidance-delta.vercel.app/admin (owner/admin wallet only)

## Repository layout

```
contracts/     Voidance GenLayer Intelligent Contract (Python)
backend/       Always-on Express + Postgres API (Fly.io) — indexes contract state
frontend/      Next.js app (Vercel) — landing, policies, dashboard, claims, admin
database/      SQL migrations for the backend's read-cache schema
deployment/    fly.toml, vercel.json
docs/          Architecture notes, end-to-end test guide
tests/contract/  Contract test suite (genlayer-test Direct Mode)
backend/tests/   Backend API test suite
```

## How the platform actually works (read this before testing)

1. **Sponsor funds a policy** (`create_policy`, payable) — attaches real GEN
   as coverage for one specific research milestone, sets a public
   methodology document URL.
2. **One researcher accepts it** (`accept_policy`, payable, exact premium
   required). **Only one researcher can ever accept a given policy** — the
   moment someone accepts, the policy leaves the acceptable pool for
   everyone else. There is no multi-researcher competition on a single
   policy by design.
3. **That same researcher — and only that researcher — can file a claim**
   (`submit_claim`) if the milestone fails, with a narrative plus
   independent evidence URLs. The sponsor cannot file it; nobody else can
   either.
4. **Anyone can trigger evaluation** (`evaluate_claim`) — resolution is
   permissionless by design so it can't get stuck if either party goes
   quiet. GenLayer validators actually fetch the methodology URL and every
   evidence URL, score five rigor criteria, and reach tolerant consensus.
5. **Settlement credits an internal balance — it does not push GEN to your
   wallet automatically.** Every party with a nonzero balance
   (`get_balance_of`) must separately call `withdraw_all()` — in the app,
   that's the "Withdraw to Wallet" button on the **Dashboard** page. This
   two-step (credit, then withdraw) is a deliberate reentrancy-safety
   pattern, not a bug.
6. **On a `FAIL` verdict**, the sponsor receives back their full coverage
   **plus** the researcher's forfeited premium bond — the bond exists
   specifically so a researcher can't costlessly file a fabricated or
   negligent claim. On `PASS`, the researcher gets full coverage plus their
   bond back. On `PARTIAL`, coverage splits proportionally but the
   researcher's bond always comes back in full. Every path is enumerated
   and tested in `tests/contract/test_voidance.py`.
7. **Timeouts exist so funds can never get stuck**: `claim_sponsor_timeout`
   lets the sponsor reclaim coverage if nobody ever accepts;
   `claim_expired_no_claim` returns both sides' funds if the researcher
   accepts but never files a claim; `cancel_policy` lets the sponsor pull
   out before anyone accepts.

Full step-by-step field values for testing this on real StudioNet with real
GEN are in [`docs/TESTING.md`](docs/TESTING.md).

## Admin console

At `/admin`, gated by an on-chain `is_admin(address)` check (owner or any
address added via `add_admin`). Lets an admin: pause/unpause the platform
(halts new policies, acceptances, claims, and settlement — withdrawals of
already-credited balances always stay available), update the protocol fee
(capped at 10%), sweep accrued protocol fees into the owner's withdrawable
balance, and see every policy on the platform.

## Local development

### Contract

The contract (`contracts/innovation_failure_insurance.py`) is deployed
manually via GenLayer Studio — see its module docstring for design notes.

Run the contract test suite (in-memory execution against the real pinned
GenVM SDK, no Docker/simulator needed):

```bash
pip install genlayer-test    # needs Python 3.12 or 3.13, NOT 3.14 — see below
pytest tests/contract -v
```

**Known footgun, already hit once**: never create a directory literally
named `genlayer` anywhere under the repo root. Python's implicit
namespace-package resolution will silently shadow the real GenVM SDK with
an empty stub, producing a baffling `NameError: name 'allow_storage' is not
defined` deep inside the test loader that has nothing to do with your code.
See `MEMORY.md` for the full story.

### Backend

Only external dependency is Postgres — deliberately no Redis or other
cache/store, so the backend's uptime can never depend on a second service
being reachable.

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL, GENLAYER_RPC_URL, VOIDANCE_CONTRACT_ADDRESS
npm install
npm run migrate
npm run dev             # http://localhost:4000
```

Run the backend test suite (real Postgres via Docker, not mocked):

```bash
docker run -d --name voidance-pg-test -e POSTGRES_USER=voidance \
  -e POSTGRES_PASSWORD=voidance -e POSTGRES_DB=voidance_test \
  -p 5442:5432 postgres:16-alpine
npm test
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

**Runs on Next.js 14.2** (deliberately, not the newer 15/16 — see
`MEMORY.md`). Dynamic route pages (`app/policies/[id]/page.tsx` etc.) use
Next 14's plain-object `params` prop, **not** Next 15's `params: Promise<T>`
+ `use(params)` pattern — mixing the two throws a client-side React error
that only shows up at runtime, not at build time. If you add a new dynamic
route, copy the existing pattern.

Writes (create/accept/claim/evaluate/withdraw) go through `genlayer-js`
directly (`lib/genlayerWallet.ts`), signed by the connected wallet's own
EIP-1193 provider — not a generic EVM ABI call, because GenLayer Intelligent
Contract transactions carry nondet execution parameters a plain ABI can't
represent. Reads that don't need the backend's cache (e.g. the admin gate)
go through `lib/genlayerRead.ts`, an unsigned `genlayer-js` client.

Wallet connection needs a real WalletConnect Cloud project ID
(`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`) for WalletConnect-based mobile
wallets to work — browser-injected wallets (MetaMask etc.) work without it.
Get one free at https://cloud.walletconnect.com.

## Deployment

- **Backend**: Fly.io, `deployment/fly.toml` (`min_machines_running = 1`,
  `auto_stop_machines = "off"`, rolling deploys, `/health` checks, 2
  machines for zero-downtime deploys) — run
  `fly deploy --config deployment/fly.toml --app voidance-backend` from the
  repo root. Secrets: `fly secrets set GENLAYER_RPC_URL=... VOIDANCE_CONTRACT_ADDRESS=... CORS_ORIGINS=...`
  (must include the exact deployed Vercel URL, not a guessed one — a
  mismatch here silently breaks every frontend API call with a CORS error
  and no server-side log).
- **Frontend**: Vercel, `deployment/vercel.json` points at `frontend/`. Set
  `NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_VOIDANCE_CONTRACT_ADDRESS`,
  `NEXT_PUBLIC_RPC_URL`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` as
  production env vars, then `vercel --prod`.

## What's been tested vs. what hasn't

**Verified on real StudioNet with real GEN and two wallets**: full policy
lifecycle through a `FAIL` verdict — create → accept → claim → evaluate →
withdraw, including the sponsor receiving both the coverage refund and the
researcher's forfeited bond.

**Not yet tested on-chain** (structurally verified — deployed, builds pass,
unit tests pass — but nobody has run these specific paths for real):
`PASS` and `PARTIAL` verdicts, `cancel_policy`, `claim_sponsor_timeout`,
`claim_expired_no_claim`, `withdraw_claim`, the admin console's
pause/unpause/fee-sweep actions, and the researcher-side Dashboard view.
See the "What have we done so far and what do we have left" thread in
session history, or just ask — this list gets shorter as more of the flow
gets exercised for real.

## License

MIT — see [`LICENSE`](LICENSE).
