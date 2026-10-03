# Bestcrow frontend

The Next.js app has a campaign creation form on `/` and a campaign page at `/campaign/<address>`. The campaign page supports USDC pledge, withdrawal during funding, evidence submission by the creator, Yes/No votes by backers, permissionless deadline resolution and proportional refunds. There are no market or trading routes.

## Run locally

```sh
npm ci --ignore-scripts
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. The backend defaults to port 3001. In Docker use the root `compose.yaml`; if the old stack occupies 3000/3001, set `FRONTEND_HOST_PORT=3100` and `BACKEND_HOST_PORT=3101` in the root `.env`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `BACKEND_URL` | `http://127.0.0.1:3001` | Server-side API address |
| `BACKEND_TIMEOUT_MS` | `1500` | Health request timeout; account proxy allows at least ten seconds |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Public devnet RPC | Wallet-side Solana endpoint |
| `NEXT_PUBLIC_BESTCROW_PROGRAM_ID` | Placeholder program ID | Client-side instruction allowlist; match the deployment |
| `NEXT_PUBLIC_USDC_MINT` | Devnet Circle USDC | Mint used by the campaign form |

The wallet only signs the prepared Bestcrow instruction after a local simulation. The server never gets a private key. The creator's title and evidence text are hashed locally; publish the actual content separately so backers can review it.

The frontend is ready for a deployed program, but this branch has no verified v2 deployment or live campaign. Until deployment, a prepared create transaction cannot succeed on chain. Public devnet RPC rate limits may also block reads.
