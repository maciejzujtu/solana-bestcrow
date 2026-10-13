# Bestcrow backend

Bestcrow's target product is startup crowdfunding with staged releases, not a
charity campaign directory. This document describes the **current legacy API**.
The target MVP rules below are requirements for the next implementation pass;
they are not enforced by the current backend or deployed program.
The [implementation plan](../docs/IMPLEMENTATION_PLAN.md) is the canonical
source for the ordered program, backend, frontend, and verification work.

The backend has two sectors for the currently named Charity Vault Solana program:

- `chain`: campaign reads, metadata, indexing and unsigned instruction builders.
- `accounts`: registration, sessions, verified Phantom links and SOL payment records.

Phantom keeps its keys and signs in the browser. The backend verifies ownership
and settlement using public addresses, signatures and chain data.

The chain sector provides:

- **Indexer** — polls the program's campaign and donor-ledger accounts, parses
  Anchor events from transaction logs, and stores everything in SQLite.
- **REST API** — fast campaign/donor/event listings, aggregate stats, and a
  filterable campaign search.
- **Off-chain metadata** — titles, long descriptions, images, and rewards, with
  the description verified against the on-chain `desc_hash` commitment.
- **Instruction builders** — stateless endpoints that return the accounts and
  hex instruction data any client needs to build a transaction (no signing).

## Requirements

- Node.js >= 22.5 (uses the built-in `node:sqlite` module)
- A Solana RPC endpoint (devnet by default)

## Setup

```bash
cd backend
npm install
cp .env.example .env      # optional; defaults target devnet
npm run dev               # watch mode
```

Production:

```bash
npm run build
npm start
```

Validate:

```bash
npm run typecheck
npm test
```

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins, or `*` |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` | RPC endpoint |
| `RPC_RETRY_ATTEMPTS` | `3` | Retries after HTTP 429 throttling |
| `RPC_RETRY_BASE_DELAY_MS` | `250` | Initial exponential-backoff delay |
| `CHARITY_VAULT_PROGRAM_ID` | `74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG` | Program id |
| `CLUSTER` | `devnet` | Label used in responses/Explorer links |
| `DB_PATH` | `./data/bestcrow.db` | SQLite file (`:memory:` for ephemeral) |
| `INDEXER_ENABLED` | `true` | Toggle the background indexer |
| `POLL_INTERVAL_MS` | `15000` | Indexer poll interval |
| `SIGNATURE_SCAN_LIMIT` | `200` | Max recent signatures scanned per poll |
| `APP_ORIGIN` | `http://localhost:3000` | Frontend origin included in wallet proofs |
| `SESSION_TTL_SECONDS` | `86400` | Revocable session lifetime |
| `WALLET_CHALLENGE_TTL_SECONDS` | `300` | One-use wallet proof lifetime |
| `AUTH_ATTEMPTS_PER_MINUTE` | `20` | Combined per-IP auth and challenge limit |

## API

Full reference: **[API.md](API.md)** (endpoints, query params, response shapes,
error codes, and instruction plans).

Account, wallet and payment routes: **[Accounts API](docs/ACCOUNTS.md)**.

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/api/chain/config` | Authoritative RPC, program ID, wallet chain and transaction versions |
| `GET` | `/api/health` | Liveness, last indexed slot/signature |
| `GET` | `/api/stats` | Aggregate campaign/donor/refund totals |
| `GET` | `/api/program` | Program id, account sizes, instruction discriminators |
| `GET` | `/api/campaigns` | List; `status`, `creator`, `q`, `sort` (`created\|deadline\|raised\|progress`), `order`, `limit`, `offset` |
| `GET` | `/api/campaigns/by-pda` | Resolve by `creator` + `campaignId` |
| `GET` | `/api/campaigns/:address` | Campaign with donors and metadata |
| `GET` | `/api/campaigns/:address/donors` | Donor ledger (sorted by amount) |
| `GET` | `/api/campaigns/:address/events` | Indexed event history |
| `GET` | `/api/campaigns/:address/metadata` | Off-chain metadata |
| `PUT` | `/api/campaigns/:address/metadata` | Creator session required; description must match the on-chain commitment |
| `GET` | `/api/instructions/create` | Build `create_campaign` (`creator`, `campaignId`, `goal`, `deadline`, `descHash`) |
| `GET` | `/api/instructions/pledge` | Build `pledge` (`donor`, `campaign`, `amount`) |
| `GET` | `/api/instructions/finalize` | Build `finalize` (`caller`, `campaign`) |
| `GET` | `/api/instructions/claim-success` | Build `claim_success` (`creator`, `campaign`) |
| `GET` | `/api/instructions/claim-refund` | Build `claim_refund` (`donor`, `campaign`) |
| `GET` | `/api/instructions/refund-all/:campaign` | Build `refund_all` using canonical on-chain donor order + `caller` |
| `GET` | `/api/stream` | Server-Sent Events stream of indexer syncs |

`refund-all` is a **legacy route to remove** after the program and clients switch
to individual refunds. Do not build new flows around it.

All amounts are lamports as decimal strings (`u64`); SOL equivalents are provided
alongside as `*Sol` fields.

### Example

```bash
curl localhost:4000/api/campaigns?status=active&sort=progress
curl localhost:4000/api/campaigns/So11111111111111111111111111111111111111112
```

## Architecture

```text
src/
  index.ts                     Entry point
  application.ts               BackendApplication: server/indexer lifecycle
  api/server.ts                BackendServer: sector composition
  config.ts                    Environment settings
  db/                          SQLite campaign read model
  solana/                      Rust codecs, PDAs, RPC and indexer
  core/                        Typed endpoint/requester contracts, rate limiter
  sectors/
    chain/
      campaigns/               Campaign data and metadata
      instructions/            Unsigned instruction plans
      system/                  Network, health, stats and events
    accounts/
      auth/                    Registration, password login and sessions
      wallets/                 Ed25519 challenges, linking and wallet login
      payments/                Pledge intents and finalized verification
      repository.ts            Account/session/wallet persistence
  client/
    bestcrowClient.ts          Typed HTTP client
    baseClient.ts              Shared requester; .chain and .accounts
    chain/                     service.ts, types.ts, endpoints.ts, index.ts
    accounts/                  service.ts, types.ts, endpoints.ts, index.ts
test/
  chain/                       Chain/configuration tests
  accounts/                    Auth/wallet/payment/API tests
  client/                      SDK contract tests
  support/                     In-memory HTTP transport
```

Sector modules separate service classes, DTOs, routes and exports. Constructors
receive their dependencies. The client follows TSOS's
`BaseClient -> RequestExecutor -> service` structure, using Bearer sessions.
Legacy route/helper exports delegate to these classes.

Tests compile to `dist-test/` and run recursively. HTTP tests execute real Node
HTTP parsing and Express routes over memory streams, without opening a port.
Wallet tests use temporary generated keys; payment tests inject RPC responses.

## Network and signing

`CLUSTER`, `SOLANA_RPC_URL` and `CHARITY_VAULT_PROGRAM_ID` identify the backend's
network. The frontend must use the same RPC and program. `/api/chain/config`
exposes that public configuration. A sector override that conflicts with runtime
settings is rejected.

Use Devnet for Phantom and fund the connected Phantom address there. Funding the
CLI deployer does not fund the user's wallet. Localnet returns `walletChain: null`
because it needs a wallet that explicitly supports that local network. Restart or
rebuild the frontend after changing its `NEXT_PUBLIC_*` settings.

No account endpoint reads a keypair file. Deployment and demo scripts remain CLI
tools with their own deployer. The Solana program checks the actual signer and
controls funds; account sessions protect off-chain resources.

## Client example

```ts
import { BestcrowClient } from './src/client/index.js';

const api = new BestcrowClient({ baseUrl: 'http://localhost:4000' });
const session = await api.accounts.login({ email, password });
const accountApi = api.withSession(session.token);
const challenge = await accountApi.accounts.createWalletChallenge({
  address: phantomAddress,
  purpose: 'link',
});
// Sign the exact UTF-8 message in Phantom and base64-encode its 64-byte signature.
await accountApi.accounts.linkWallet({ challengeId: challenge.id, signatureBase64 });

const payment = await accountApi.accounts.createPayment({
  campaign: campaignAddress,
  wallet: phantomAddress,
  amount: '100000000',
});
// Simulate and submit one Phantom-signed transaction with instruction + memoInstruction.
await accountApi.accounts.confirmPayment(payment.id, transactionSignature);
```

The fetch implementation and timeout are injectable. `withSession` creates a
separate client; it does not write the token into browser storage.

## Notes and limits

- The chain API retains the six existing base instruction builders. Rust staged
  funding and milestone instructions do not yet have backend builders.
- Account endpoints and SDK are implemented, but registration currently requires
  email/password, while wallet login only works for a previously linked wallet.
  Wallet-first account creation and the frontend session flow are target work.
- Payments mean SOL pledges to campaigns. Email delivery, password reset and card
  processing are not implemented.
- Off-chain metadata is only as trustworthy as the hash check: a `verified: true`
  record means the stored description matches the on-chain SHA-256 commitment.
- The current program caps a campaign at 12 donors to make `refund_all` fit one
  legacy transaction. Both the cap and bulk refund are slated for removal.
- Event reconstruction depends on RPC log retention (`SIGNATURE_SCAN_LIMIT`);
  account state is always re-synced in full each poll.

## Target MVP (not implemented)

- A creator publishes a startup campaign with a complete schedule of 2-5
  milestones. Each allocation is at most 50% and the allocations total 100%.
  The schedule and other pledged terms freeze when fundraising begins. The
  fundraising window is between one week and six months. Contributions may
  exceed the goal.
- Success is decided after the fundraising deadline. Only a successful campaign
  pays a 1% platform fee on the final amount raised; allocations are percentages
  of the post-fee amount. An unsuccessful campaign pays no fee and each backer
  may claim 100% of their own pledge. The on-chain vault, not an indexer total,
  must enforce these balances. Refunds require separate user transactions (or
  a permissionless helper submitting them one by one); they are not automatic.
- Campaign creation locks a no creator deposit distinct from pledges and
  transaction/rent costs. Its release and forfeiture conditions must be
  specified and enforced in the on-chain lifecycle before it is offered as
  refundable; a successful fundraiser alone must not release it.
- For each proof-gated milestone, voting lasts exactly seven days. Approval
  requires `yes` weight strictly greater than 50% of all eligible pledged
  weight, including abstentions in the denominator. Failure gives the creator
  30 days to submit one revision and then seven days for the second vote.
  No votes means failure. Timeouts and finalization must be callable by anyone.
- Wallet proof should create or resume a backer account without email. Creators
  can add an organization profile for presentation, with no identity verification,
  platform approval, or platform signature required to create an on-chain campaign.
  A "my contributions" view should reconcile linked wallets with indexed
  pledges, claims, and refunds, including transactions made outside the API.
- Campaign descriptions and milestone proofs need durable storage and integrity
  checks against on-chain commitments. An indexer/API `verified` flag denotes
  a hash match only, not a claim that a startup or its evidence is legitimate.
  The frontend must fetch and check the stored content, not trust text embedded
  in a shareable URL. Server-side reward fulfilment can follow after the core
  escrow and account flow is complete.

See [API.md](API.md) and [Accounts API](docs/ACCOUNTS.md) for the current routes and
their planned migration. The staged program and fee/deposit accounting need
adversarial tests before describing the target rules as deployed behavior.
