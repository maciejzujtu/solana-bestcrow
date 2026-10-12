# Bestcrow — speaker notes (10 slides, ~3 minutes)

Timing target: ~18 seconds per slide. If cut short, keep the **bold** sentence.

## 1 — Bestcrow (title) — 12s
Bestcrow is escrow that releases by rule, not by an operator. It's startup/prototype crowdfunding on Solana where backers approve each release, and every failure path is permissionless. **We remove the Kickstarter-style intermediary from custody and payout decisions.**

## 2 — Problem — 20s
Two people who don't know each other need a platform both must trust. The creator needs capital before the work exists; the backer hands money to a stranger and to the operator. **We picked a specific user — early-stage teams raising in milestones, and their backers — not "everyone".**

## 3 — The intermediary, named — 22s
The operator is custody plus discretionary payout: it holds the money, takes a cut, can freeze, and on success pays everything at once. We move custody into a program-owned vault and gate releases by votes fixed at creation. **Why not a database? Because a DB admin can edit state and still controls the payout rails — here the rule is the source of truth.**

## 4 — Terms locked before the first pledge — 18s
The creator drafts 2–5 tranches, each at most 50%, summing to 100%, and seals them before any pledge. The MVP has no creator deposit. Funding runs 7–183 days and allows overfunding. **No one can reshape the schedule after money is in.**

## 5 — Backers approve each release — 20s
Evidence opens a 7-day vote; weight is the final pledge; approval needs strictly more than 50% of all contributions. First failure = 30 days to improve, then a second vote; second failure = termination. **An approved tranche is payable exactly once to a fixed recipient — no admin picks winners.**

## 6 — Failure is first-class — 18s
Missed goal: no fee, each backer claims 100%. Termination: the pool is frozen and refunded pro-rata. Refunds and releases are exactly-once. **Anyone can submit an eligible transaction — a timer never moves money by itself.**

## 7 — Proof on devnet — 20s
This is prototype, not a mockup. The prototype includes the program, client, indexer and deployment workflow. The final V2 Devnet transaction links are pending verification. **Show the prototype and repository workflow.**

## 8 — Built for the ecosystem — 16s
Rust + Anchor 1.1.2 on-chain with fixed-size state and checked math; @solana/kit + Wallet Standard on the client; LiteSVM tests plus client tests. A Node/SQLite indexer serves fast reads but never controls funds. **Tokenless — no oracle, no market to manipulate.**

## 9 — What's true today — 20s
We separate verified, implemented, in-progress, and planned. The honest limit: the program enforces money, not worthiness or delivery, and it can't prove handover; upgrade authority is disclosed. **We lead with limits because judges reward awareness, not pretending.**

## 10 — Why this wins / next — 18s
Mapped to the rubric: relevance 30 because custody is removed on-chain; completeness 25 on the click-through prototype and local tests; a named user and honest boundary for the idea score; Anchor + tests + client for implementation; a tokenless conditional vault for originality. **Ask: try the demo, read the repo, and point us at a real team to pilot.**

---

### Q&A prep (short answers)
- **Where exactly does the intermediary disappear?** In the vault + rules: only the program's fixed state transitions move funds; the backend can't bypass them.
- **Party disappears mid-flow?** Missed goal refunds; a rejected milestone lets anyone terminate and refund pro-rata; approved tranches remain payable.
- **Can the author change it?** The deploy wallet holds upgrade authority; that's disclosed, not hidden. Remove it after the intended version is tested.
- **Why blockchain, not a database?** The rule, not an operator, is the source of truth; a DB admin could edit state and control payouts.
- **Next week?** Confirm V2 on Devnet, run the adversarial tests, add a durable public content store.
