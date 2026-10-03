# Bestcrow v2 project instructions

## Source priority

Read the actual competition rules in `docs/RULES Finance Without Intermediaries.pdf` and the challenge criteria in `docs/CRITERIA Finance Without Intermediaries PLENG.pdf` before making competition claims. They take precedence over Markdown plans and reference code. Cite PDF filename and page/section when a requirement drives a change, and verify it before claiming completion.

## Current implementation direction

The current user request removes the MetaDAO dependency. On branch `v2`, `rust/programs/bestcrow` is a USDC milestone escrow program with contribution-weighted backer voting; `backend/` prepares unsigned crowdfunding instructions and runs an optional keeper; `frontend/` has campaign creation and participation forms. The original SOL Charity Vault is in the `main` branch. `agents/PROJECT.md`, `agents/CONTEXT.md`, `EXECUTION_PLAN.md` and `INSPIRATIONS.md` contain historical plans.

- Require five to ten milestones, with no single milestone over 50% of the goal and kickoff release at most 30%. All allocations must sum to the goal.
- Keep deposits, payout permission, deadlines and refund accounting on chain. The backend prepares transactions but cannot override the program.
- A milestone passes only with Yes weight greater than half of all funded USDC after its vote closes. A market must remain an optional, separate extension and cannot control this program's escrow.
- Refunds cover remaining escrow only; already released funds cannot be recovered.
- Participation is pseudonymous: wallets, amounts, votes and transactions are public. Do not put personal or shipping details on chain.
- An active program upgrade authority can change rules. Disclose it for any deployment.
- Keep implemented, tested and live-verified behavior distinct. A Docker build or unit test is not a confirmed on-chain crowdfunding flow.

For versioned external APIs, follow the Context7 workflow in `INSTRUCTIONS.md` if those MCP tools are available. If unavailable, use official versioned documentation and state that the live lookup was unavailable. Never use reference code in `context/` as proof of this program's behavior.
