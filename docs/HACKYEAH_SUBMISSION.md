# HackYeah submission links

Use the following short run instructions in the HackYeah project page and link
to this README for the complete version:

```text
Requirements: Docker Desktop with Linux containers enabled.

git clone https://github.com/maciejzujtu/solana-bestcrow.git
cd solana-bestcrow
Copy-Item .env.example .env
docker compose up --build

Open http://localhost:3000
API health: http://localhost:4000/api/health
```

The Docker stack starts the Next.js frontend and the Node API/indexer. It uses
Solana Devnet by default. A Devnet wallet is required for signing actions.
The stack does not deploy the Solana program; the deployment procedure is in
`docs/DEVNET_DEPLOYMENT.md`.
