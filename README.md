# Voidance

Decentralized insurance for research labs, startups, universities, and
innovation funds. Voidance covers genuine, rigorous research efforts that
fail despite honest, well-documented work — adjudicated on-chain by GenLayer
validator consensus over real, contract-fetched evidence, with actual GEN
value transfer, not a synthetic points system.

See [`MEMORY.md`](MEMORY.md) for the full project history, hard decisions,
and open follow-ups — read it first before making architectural changes.

## Repository layout

```
contracts/     Voidance GenLayer Intelligent Contract (Python)
backend/       Always-on Express + Postgres API (Fly.io) — indexes contract state
frontend/      Next.js app (Vercel) — landing, policies, dashboard, claims
database/      SQL migrations for the backend's read-cache schema
deployment/    fly.toml, vercel.json
docs/          Architecture notes
```

## Deployed contract

- **Network**: GenLayer StudioNet
- **Address**: `0x58dED66906Ceb587236591C5d9729CE89501cbC2`

## Local development

### Contract

The contract (`contracts/innovation_failure_insurance.py`) is deployed
manually via GenLayer Studio — see its module docstring for design notes.

### Backend

```bash
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm run migrate
npm run dev             # http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

## Deployment

- **Backend**: Fly.io, `deployment/fly.toml` (`min_machines_running = 1`,
  `auto_stop_machines = "off"`, rolling deploys, `/health` checks) — run
  `fly deploy --config deployment/fly.toml` from the repo root.
- **Frontend**: Vercel, `deployment/vercel.json` points at `frontend/`.

## License

MIT — see [`LICENSE`](LICENSE).
