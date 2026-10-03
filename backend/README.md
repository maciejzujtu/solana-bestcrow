# Bestcrow TypeScript API

The API reads Anchor accounts through the generated client and prepares unsigned instructions. Wallets add a blockhash, simulate, sign and send. No API endpoint can override escrow rules.

## Run

Node.js 22.16 or newer:

```sh
npm ci --ignore-scripts
npm run check
npm test
npm start
```

Or from the repository root: `docker compose --profile backend up --build -d backend`. Health is `GET http://127.0.0.1:3001/health` by default. The keeper is off unless `POLL_MS` is positive.

## Configuration

| Variable | Default | Use |
| --- | --- | --- |
| `RPC_URL` | Public devnet RPC | Solana endpoint used by API |
| `HOST` / `PORT` | `0.0.0.0` / `3001` | HTTP binding |
| `STAGEGATE_PROGRAM_ID` | Repository's placeholder ID | Must match deployed Bestcrow program, IDL and frontend |
| `USDC_MINTS` | Circle devnet and mainnet USDC | Accepted quote mints |
| `POLL_MS` | `0` | Keeper scan interval; `0` disables polling |
| `KEEPER_AUTOSEND` | `0` | Optional operator dispatcher |
| `KEEPER_KEYPAIR_PATH` | unset | External keypair path if autosend is enabled |

The public devnet RPC may return HTTP 429. Health checks only verify that the API process runs; use a reliable RPC for account reads and real tests.

## Routes

| Route | Result |
| --- | --- |
| `GET /health` | Process status |
| `GET /campaigns` | Decoded campaigns |
| `GET /campaigns/:address` | One decoded campaign |
| `POST /campaigns/prepare` | Unsigned create instruction and derived campaign PDA |
| `POST /campaigns/:address/pledge/prepare` | Unsigned USDC pledge |
| `POST /campaigns/:address/withdraw/prepare` | Unsigned withdrawal during funding |
| `POST /campaigns/:address/evidence/prepare` | Unsigned evidence submission |
| `POST /campaigns/:address/vote/prepare` | Unsigned weighted Yes/No vote |
| `GET /campaigns/:address/action?caller=<wallet>` | Current permissionless finalization instruction |
| `GET /campaigns/:address/refund?wallet=<wallet>&caller=<wallet>` | Refund amount and unsigned instruction |
| `GET /keeper/actions` | Eligible campaign transitions |

All amounts in prepare requests are human-readable decimal USDC. `POST /campaigns/prepare` takes `creator`, `campaignId`, `quoteMint`, `goal`, `initialRelease`, `fundingDeadline` (Unix seconds), `voteDurationSecs`, `metadataHash` (64 hex characters), and five to ten `{amount,dueAt}` milestones. Pledge/withdraw take `{wallet,amount}`. Evidence takes `{creator,evidenceHash}`. Vote takes `{wallet,approve}`.

Every prepared instruction is `{programId, accounts: [{address,isSigner,isWritable}], data}` with base64 data. The backend validates inputs and derives PDAs, but the Anchor program is the authority for all money movement.

Optional keeper autosend rechecks eligibility immediately before sending. It uses an external operator keypair and is off by default. No keypair is generated or committed here.
