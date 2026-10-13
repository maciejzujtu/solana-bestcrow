# Bestcrow frontend

The frontend contains the responsive Bestcrow discovery, campaign detail,
creation, explanation, creator profile and “My support” views. It reads V2
accounts directly, verifies permanent manifests against on-chain commitments,
and builds V2 transactions with simulation and a single wallet approval per
step. The UI stays disabled until the Devnet deployment exposes
`ProtocolConfigV2`.
Follow the [ordered implementation plan](../docs/IMPLEMENTATION_PLAN.md)
for the financial rules and backend dependencies.

For the visual layer, use [Colosseum](https://colosseum.com/) as the design
inspiration. The [frontend sketch](STOCKGATE_FRONTEND_SKETCH.md#visual-reference)
explains how to adapt that reference to Bestcrow without copying its branding
or weakening the clarity of campaign and transaction states.

Reusable Solana helpers live in `app/lib/`. They use @solana/kit, handle v1
wallet support with a v0 fallback, retry transient Solana HTTP 429 responses,
and show a dedicated-provider hint after the retry budget is exhausted.

```bash
npm install
npm run dev
```

## MVP screens and interaction requirements

1. A wallet-first session creates or resumes a backer account after a signed
   challenge, with no email required. A creator can add organization details
   for display. Do not show a verification badge or require platform approval
   to create an on-chain campaign.
2. The creation form collects and validates the entire campaign before the
   first transaction: startup description and durable metadata, goal, 7-day to
   six-month fundraising window, and 2-5 milestone allocations each at most
   50% and totaling exactly 100%. Show the no creator deposit, network
   costs, and the 1% success-only platform fee separately. Freeze campaign
   terms when fundraising starts; there is no post-start editing or adding
   milestones. The deposit's exact return conditions/timing remain to be
   specified and must not be implied in the UI until enforced on-chain.
3. Discovery and detail views show startup campaigns, allow the raised amount
   and progress to exceed the goal, and fetch metadata from durable storage.
   Check the on-chain description/proof hashes before displaying content as
   verified. Never treat a shareable URL parameter as trusted campaign copy.
4. Detail views show the actual on-chain lifecycle, proof links, claim status,
   fee and net milestone budget. Voting starts with a fixed seven-day window;
   approval requires yes weight strictly greater than 50% of all eligible
   pledged weight. Display that denominator, not just votes cast. No votes
   means rejection. Rejection opens a full 30-day revision window, then a
   seven-day second ballot. Surface permissionless finalize/timeout actions.
5. Pledging, cancellation during fundraising, individual full refunds after a
   failed goal, and approved milestone withdrawals must build the correct
   transactions. A failed goal takes no platform fee; refunds require a user
   transaction and are not automatic. Splits, already approved claims, and
   one-time milestone payment must match program accounting.
6. "My contributions" reconciles linked wallets with indexed on-chain stakes
   and claims, including direct wallet payments that never used a backend
   payment intent. Show eligibility, transaction status, and indexer freshness.

Reward entitlement and delivery are later server-side work. The UI must not
promise a reward fulfilment system before it exists. The frontend, backend,
program, and devnet deployment must use the same current program ID and rules.
