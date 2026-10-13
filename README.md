# Bestcrow

Instrukcja bezpiecznego buildu, wdrożenia V2 na Devnet, inicjalizacji
`ProtocolConfigV2`, smoke testu i opcjonalnej blokady upgrade authority:
[docs/DEVNET_DEPLOYMENT.md](docs/DEVNET_DEPLOYMENT.md).

Bestcrow is a proposed Solana escrow for **startup and prototype crowdfunding**.
Backers fund a campaign in SOL, the creator receives a fixed starting tranche,
and later tranches depend on contribution-weighted votes. The platform may
index campaigns and host private reward data, but it must not hold campaign
funds or decide whether a release or refund is allowed.

**Important:** this README distinguishes the [target protocol](docs/IMPLEMENTATION_PLAN.md)
from the program currently in the repository. The target rules, fee and deposit
are **not implemented yet**. Do not use the existing staged program for real funds
before the listed payout and voting defects are fixed and tested.

## Agreed MVP

- Startup/prototype campaigns funded only in SOL. A creator can prepare a
  draft; all financial terms are locked before the first contribution.
- Funding lasts 7-183 days. A campaign has 2-5 tranches, including the initial
  release. Every tranche is at most 50% and the shares sum to exactly 100%.
- Contributions may exceed the goal. Backers may cancel their deposits only
  during the funding window. Final contribution amounts fix vote weights.
- If the goal is missed, each backer is entitled to 100% of their contributed
  SOL, with no platform fee. Network transaction fees are separate.
- If the goal is met, the program charges a fixed **1% of the full amount
  raised**, once, to a published treasury. Tranche percentages apply to the
  remaining 99%, with lamport rounding accounted for.
- The MVP has no creator deposit. Bot protection and anti spam measures are deferred to P6 and are presentation ideas for now.
- Evidence opens a seven-day vote. Approval requires YES weight strictly
  greater than half of all final contributions. Exactly 50%, abstention and
  no votes do not approve a release. A first failure gives 30 full days to
  improve; then a second seven-day vote runs. A second failure, missed proof
  deadline or abandonment must have an on-chain termination/refund path.
- Anyone can submit an eligible finalization/settlement transaction, but only
  the program's fixed rules choose recipients and amounts. Refunds are
  individual claims; a timer alone cannot send a transaction.
- Creator profiles may appear in the web app without identity verification.
  There is no platform co-signature or admin approval gate for on-chain
  campaign creation in this MVP. Bot resistance is future product work.

The full protocol decisions, open questions and chronological task list are in
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).
The frontend's visual direction takes inspiration from
[Colosseum](https://colosseum.com/); see the
[frontend design brief](frontend/STOCKGATE_FRONTEND_SKETCH.md#visual-reference).

## Current repository state

At commit `15cb14a`, the Anchor program contains a base all-or-nothing flow
and a staged flow. It has campaign, vault, donor, milestone, vote, split and
claim accounts. The Node backend provides an indexer, SQLite read model,
REST API, email/password accounts, linked-wallet login and payment intents.
The current Next.js pages for campaign creation and detail are **scaffolds**;
library code and a Solana client exist, but the promised end-to-end UI is not
wired. The backend is not the authority for settlement.

The current program differs materially from the agreed MVP:

| Area | Current code | Required change |
| --- | --- | --- |
| Funding | Pledges stop at the goal; max 12 donors | Allow overfunding and independent donor ledgers without the cap |
| Terms | Up to five milestones can be added during fundraising | Lock a complete 2-5 tranche, 100% schedule before any pledge |
| Vote | 70% of raised weight; no enforced vote window | Strictly over 50%; seven-day rounds with a 30-day revision interval |
| Settlement | A closed milestone claim can be recreated; split can be bypassed | Exactly-once release and mandatory configured recipients |
| Bond | Reclaimable right after success; inaccessible after a failed goal | Mandatory no creator deposit with complete return/forfeiture rules |
| Refund | Individual claims plus `refund_all`; no cancellation | Remove batch refund, support funding-window cancellation and scalable claims |
| Fee | No platform fee | Fixed 1% only on successful fundraising |
| Web | Campaign pages are placeholders | Complete startup-specific creation, discovery, detail and account journeys |

Previously approved but unpaid claims also need to be reserved ahead of
termination refunds. Vote and milestone deadlines, missing-creator behavior,
and permissionless payout execution need on-chain enforcement. The
[implementation plan](docs/IMPLEMENTATION_PLAN.md) lists adversarial tests
for these cases.

## Repository

```text
rust/       Anchor program, LiteSVM tests and current API documentation
backend/    Node/Express indexer, REST API, SQLite and account services
frontend/   Next.js scaffold and Solana client library
docs/       Competition PDFs, protocol plan and reference material
agents/     Product direction and development instructions
mcp/        Local development and Solana documentation tooling
```

The [competition criteria](docs/CRITERIA%20Finance%20Without%20Intermediaries%20PLENG.pdf)
(p. 2, section 2; p. 3, sections 5-6) require transaction rules in the
on-chain program rather than in our backend, and ask whether authors can
change the program after deployment. A fixed, disclosed fee does not grant
custody or discretionary payout power, but the fee recipient and upgrade
authority must be disclosed. The latest devnet deployment has not been
confirmed for this checkout; the local smoke script exercises only a base
campaign flow.

## Local commands

```bash
docker compose up --build
```

This starts the current web and API services, not a validated target-MVP
demo. The frontend defaults to `http://localhost:3000`; API health is at
`http://localhost:4000/api/health`.

```bash
cd rust
NO_DNA=1 anchor build --no-idl -- --arch v0
NO_DNA=1 cargo test --manifest-path programs/charity-vault/Cargo.toml
```

```bash
cd backend
npm install
npm run typecheck
npm test
```

```bash
cd frontend
npm install
npm run typecheck
npm test
```

These commands describe available checks. Passing results for the **target
protocol** and a current devnet deployment must be recorded after code changes.
Do not infer either from the presence of tests or from an older demo.
