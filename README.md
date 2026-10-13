# Bestcrow

**Back the next milestone.** Non-custodial milestone-escrow crowdfunding for startup prototypes on Solana.

[![Colosseum Hackathon](https://img.shields.io/badge/Colosseum-Hackathon_2026-6366f1.svg)](https://colosseum.com/hackathon)
[![Solana Devnet](https://img.shields.io/badge/Solana-Devnet-14F195.svg)](https://explorer.solana.com/?cluster=devnet)
[![Web3.js v2](https://img.shields.io/badge/@solana/kit-v2-blue.svg)](https://github.com/solana-labs/solana-web3.js)
[![Tests Passing](https://img.shields.io/badge/tests-passing-brightgreen.svg)]()

---

## What is Bestcrow?

Bestcrow is an on-chain milestone escrow protocol designed for **early-stage startup teams and prototype builders** on Solana.

Rather than giving a creator 100% of capital upfront (the Kickstarter model, which suffers from creator rug risk and 8% centralized fees) or launching speculative tokens with zero product delivery accountability (pump.fun), Bestcrow locks funds in non-custodial Program Derived Address (PDA) vaults and releases capital in **2–5 immutable tranches gated by Arweave-hashed proof of work and contributor votes**.

> **Single Source of Truth:** For full technical specifications, mathematical proofs, economic parameters, and deployment runbooks, see the consolidated [Master Development Plan](docs/DEVELOPMENT_PLAN.md).

---

## Key Features

- **Sealed Milestone Terms:** Creators draft 2–5 tranches (each $\le 50\%$, summing to exactly 100%) and seal them before the first contribution. No schedule or terms can be altered once funding starts.
- **Fair Economic Rules:**
  - **1% Protocol Fee:** Charged once only on successful raises (`raised >= goal`) to a published treasury.
  - **0% Fee on Failure:** If the goal is missed, backers claim **100% of their deposited SOL**.
  - **0 SOL Creator Deposit:** Zero upfront barrier for builders in the MVP.
- **Contribution-Weighted Voting:**
  - Evidence submission opens a fixed 7-day vote.
  - Approval requires YES vote weight **strictly greater than 50% of all final pledges** (`yes_weight * 2 > final_raised`).
  - First rejection opens a 30-day revision window; a second rejection triggers permissionless termination.
- **Permissionless Settlement:**
  - Anyone can trigger timeout or finalization transactions after on-chain deadlines expire.
  - Pro-rata refund pool protects backers if a milestone fails.
- **Dual Operating Modes:**
  - **Devnet Mode:** Signs real transactions in Phantom with test SOL. Confirmed transactions provide direct, clickable links to **Solscan Devnet** and **Solana Explorer**.
  - **Mock Mode:** Browser-only demo mode that moves no SOL and generates no on-chain transactions, enabling instant testing without test SOL.
- **Modern Solana Stack:** Built with Anchor and **`@solana/kit` (Solana Web3.js v2)** with full type-safety and RPC failover backoff.

---

## Quickstart with Docker

Docker Compose is the recommended way to run Bestcrow locally:

```bash
git clone https://github.com/maciejzujtu/solana-bestcrow.git
cd solana-bestcrow

# Copy environment configuration
cp .env.example .env          # Windows PowerShell: Copy-Item .env.example .env

# Build and start services
docker compose up --build
```

When containers are healthy:
- **Web App:** <http://localhost:3000>
- **API Health:** <http://localhost:4000/api/health>

To stop services: `docker compose down`.

---

## Verification & Testing

All test suites pass across the workspace:

### 1. Frontend Checks (`@solana/kit` & Web3.js v2)
```bash
cd frontend
npm ci
npm run typecheck    # TypeScript verification
npm test             # 38 unit & layout tests passing
```

### 2. Backend Checks (Indexer & REST API)
```bash
cd backend
npm ci
npm run typecheck    # TypeScript verification
npm test             # 80 integration & unit tests passing
```

### 3. Rust Smart Contracts (Anchor 1.1.2)
```bash
cd rust
cargo check --workspace
cargo test --workspace
```

---

## Documentation Index

- [Master Development Plan & Protocol Spec](docs/DEVELOPMENT_PLAN.md) — Consolidated architecture, economic models, decisions D-001–D-008, and roadmap.
- [Colosseum Hackathon Submission Brief](docs/COLOSSEUM_SUBMISSION.md) — Pitch deck, track selection, video demo script, and hackathon details.
- [Devnet Deployment Runbook](docs/DEVNET_DEPLOYMENT.md) — Safe deployment checklist, IDL generation, and config initialization.
- [Backend API Reference](backend/API.md) — Indexer endpoints, SQLite schemas, and RPC integration.
- [Frontend Design Brief](frontend/STOCKGATE_FRONTEND_SKETCH.md) — Visual design language and user journeys.
