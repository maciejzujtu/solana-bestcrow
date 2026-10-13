# Bestcrow — decision log

Running record of product/technical decisions. Newest at the top. Each entry
states the decision, the reason, and the source that wins on conflict.

**Source priority:** the competition PDFs in `docs/` (`RULES …`, `CRITERIA …`)
govern competition requirements. Among project material, the
[implementation plan](IMPLEMENTATION_PLAN.md) is the canonical protocol; this
log records *which* direction is current when docs disagree.

---

## D-001 — Canonical product is startup/prototype staged crowdfunding

- **Date:** 2026-10-04
- **Status:** accepted (assumption; override if the team chooses otherwise)

**Decision.** The project targets **startup/prototype crowdfunding on Solana
with staged releases**, using the rules in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md):

- One campaign type: startup staged campaign in SOL.
- Complete terms (goal, 7–183 day window, 2–5 tranches totalling 100%,
  ≤50% each, recipients, fee, deposit) locked before the first pledge.
- Overfunding allowed; no 12-donor cap; no `refund_all`.
- Success charges a fixed **1% of the final raised amount** once, to a
  disclosed treasury; failure is a 100% refund per backer with no fee.
- **0.1 SOL** creator deposit, separate from pledges.
- Milestone vote: 7-day window, approval is **yes weight strictly > 50% of all
  final contributions**; first failure → 30-day revision → second 7-day vote;
  second failure → termination and pro-rata refund of the frozen pool.

**Consequence.** These supersede the older charity-only, 5-milestone,
70%-threshold, no-fee, `refund_all` model. Those older rules survive only as
`EXECUTION_PLAN.md`, `INSPIRATIONS.md`, `ideas`, and parts of the currently
deployed program — all legacy/reference.

**Rejected alternative.** The implemented program (base all-or-nothing +
staged 70% flow, `MAX_DONORS = 12`, `refund_all`) is **legacy reference**. It is
not the target protocol and must not be offered as the MVP in UI, docs, or the
pitch until the P1/P2 changes in the plan are implemented and tested.

**Open blockers (from the plan, do not implement settlement before deciding):**
treasury address, 0.1 SOL deposit return/forfeiture timing, first-proof
deadline, and the durable public content store for terms/evidence hashes.

---

## D-002 — Docs must distinguish proposed / implemented / verified

- **Status:** accepted

Every `.md` must say whether a behaviour is **target**, **implemented**, or
**verified** (tests/deploy). Passing tests are not proof of the target
protocol. Do not describe planned features as existing, and do not pin state to
a commit that is not in history.

---

## D-003 — Economic parameters locked (unblocks P1 settlement code)

- **Date:** 2026-10-04
- **Status:** accepted (defaults chosen so P1 can proceed; all are single
  constants and can be changed in one place before deploy)

These resolve the open-decisions table in
[IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md#otwarte-decyzje-ekonomiczne).

### Fee

- **1% of the final raised amount**, charged **once**, only when `raised >= goal`.
- Amount: `fee = floor(raised * FEE_BPS / 10_000)` with `FEE_BPS = 100`.
- Paid to a **fixed treasury address** constant in the program.
  Placeholder for devnet: `TREASURY` in `constants.rs` (replace with the team's
  disclosed address before a real deploy). Disclosed in UI and docs.
- **Void on failure:** no fee when `raised < goal`.

### Rounding (lamport-exact)

- `distributable = raised - fee`.
- Tranche `i` amount = `floor(distributable * share_bps[i] / 10_000)`.
- The **last tranche receives the remainder** so the sum of tranche amounts is
  exactly `distributable`; total paid never exceeds available lamports.
- All money math in `u128` with checked ops.

### Creator deposit (bond)

- **0.1 SOL** = `100_000_000` lamports, held in a separate bond vault PDA,
  funded at creation, distinct from pledges.
- **Returned** to the creator when: fundraising **fails** (`raised < goal`) and
  the campaign is finalized, **or** the campaign completes successfully with all
  tranches released (i.e. `released == distributable`).
- **Forfeited** to the refund pool when: a milestone fails its second vote, the
  first-proof deadline is missed, or the creator voluntarily terminates — i.e.
  any termination **not** caused by a failed goal. Forfeited lamports are added
  to the pro-rata refund pool.
- **Waiting period:** none on-chain beyond the terminal state; claimable as soon
  as the campaign reaches a terminal state where the outcome permits it.

### Deadlines

- Funding window: **7–183 days**.
- First-proof deadline: **each milestone has a work deadline** set at sealing;
  after the funding deadline the creator has exactly that milestone's period to
  submit evidence. Missing it is permissionlessly finalizable as a failure
  (opens revision/termination per voting rules).
- Voting window: **7 days**, starts when evidence is submitted.
- First failure → **30 full days** of improvement → **7-day** second vote.
- Second failure or missed proof → permissionless termination.

### Unspent overflow

- Overfunding is allowed. After success, all `distributable` is allocated to
  tranches by the fixed percentages, so there is **no separate overflow pot**;
  overflow simply raises `raised` and therefore every tranche amount.
- Any residual lamports (rounding dust) after all tranches are released and all
  ledgers are closed are swept to the creator at campaign closeout (P1.6).

### Inactive voters / denominator

- Denominator is the **frozen final `raised`**, not votes cast. Abstentions and
  non-voters count as "not yes". Approval requires `yes_weight * 2 > raised`.

---

## D-004 — Account model & migration (P0.2)

- **Status:** accepted

New modules under `programs/bestcrow/` (a fresh program) implement the target
MVP; the legacy `programs/charity-vault/` is retained as reference and is **not**
offered in the target UI. New PDAs use new seeds so old accounts are never
reinterpreted:

| Account | Seeds | Holds |
| --- | --- | --- |
| `Campaign` | `[b"campaign", creator, campaign_id_le]` | terms, state, accounting |
| `Tranche` | `[b"tranche", campaign, index]` | share_bps, work_period, status |
| `Backer` | `[b"backer", campaign, backer]` | amount, cancelled flag, claimed flags |
| `Vote` | `[b"vote", campaign, tranche, round, backer]` | approve weight snapshot |
| `Vault` | `[b"vault", campaign]` | pledged lamports |
| `Bond` | `[b"bond", campaign]` | 0.1 SOL deposit |

No migration of old devnet campaign accounts is attempted (devnet only); the
target deploy uses fresh accounts. A future mainnet launch would need an
explicit, versioned migration — out of scope for the hackathon.

---

## D-005 — Canonical terms/evidence content (P0.3)

- **Status:** accepted

- **Canonical JSON** for campaign terms: `{ v, title, description, goal,
  deadline, tranches:[{share_bps, work_period_secs}], creator }`; its SHA-256 is
  stored on-chain as `terms_hash`.
- **Canonical JSON** for milestone evidence: `{ v, campaign, tranche_index,
  summary, links:[...] }`; its SHA-256 stored as `evidence_hash`.
- **Store:** content is published to a durable public location (repo `docs/` or
  a pinning/Arweave URL) referenced by a `content_uri` integer index → URL map
  held off-chain; the on-chain account keeps only the hash.
- **Verification:** any client fetches the URI, re-hashes, and must match the
  on-chain hash before displaying "verified". A hash match proves correspondence
  to that document, not that its claims are true.
- The frontend must not treat a URL query parameter as trusted copy (supersedes
  the current `?c=` approach).
