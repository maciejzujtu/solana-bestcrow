# Bestcrow — Speaker Notes (10 Slides, ~3 Minutes, Colosseum Hackathon)

**Target Timing:** ~18 seconds per slide. If pressed for time, speak the **bold sentence**.

---

## Slide 1 — Bestcrow: Milestone-Escrow Crowdfunding on Solana (15s)
Bestcrow is non-custodial milestone crowdfunding for startup prototypes on Solana where backers approve each release and every failure path is permissionless. **We replace centralized Kickstarter custodians and speculative meme casinos with verifiable, milestone-gated capital formation.**

## Slide 2 — The Capital Formation Problem (18s)
Today on Solana, liquidity is abundant, but capital formation is broken. Founders either launch speculative tokens on bonding curves with zero product accountability, or use Web2 Kickstarter, which takes 8% and hands 100% of money upfront. **Real hardware and software builders need capital before the work exists, but backers need protection against abandonment.**

## Slide 3 — The Intermediary, Removed (18s)
Traditional platforms are custody plus discretionary control: they hold your money, take a cut, freeze accounts, and pay everything at once. We move custody into a Solana program-owned PDA vault and gate payouts by immutable rules. **The code is the sole source of truth—no platform operator can block a payout or redirect backer funds.**

## Slide 4 — Immutable Terms Sealed Before Funding (18s)
Creators draft 2 to 5 tranches, each at most 50%, summing to 100%, and seal them with an on-chain Arweave terms hash before a single pledge is accepted. Funding runs 7 to 183 days with overfunding support. **No one—not even the founder—can reshape the budget or rules after capital is committed.**

## Slide 5 — Backers Approve Each Release by Vote (20s)
Submitting evidence opens a 7-day vote. Voting weight equals the backer's final contribution. Approval requires strictly more than 50% of all contributions. A first rejection grants 30 days to improve followed by a second vote. **Approved tranches are payable exactly once to predetermined recipients—no administrator picks winners.**

## Slide 6 — Permissionless Failure & Backer Protection (18s)
If a funding goal is missed, backers claim 100% of their SOL with zero platform fee. If a milestone is rejected after fundraising, the remaining pool is frozen and refunded pro-rata. **Any caller can trigger state transitions when deadlines pass—a timer never moves money by itself.**

## Slide 7 — Live Devnet Prototype & Solscan Verification (20s)
This is not a mockup. Bestcrow is running live on Solana Devnet. You can connect Phantom, pledge test SOL, and view the transaction confirmed on Solscan Devnet in 400 milliseconds. We also built an isolated browser mock mode for instant evaluation. **Try the live demo, verify the transactions on Solscan, and inspect the code.**

## Slide 8 — Built for the Solana Ecosystem (18s)
Built in Anchor with fixed-size state, checked `u128` math, and zero-loss lamport rounding. The client is powered natively by `@solana/kit` (Solana Web3.js v2) with automatic RPC failover. We have 100% test coverage across frontend and backend. **This is pure Solana-native architecture: sub-cent voting, micro-pledges, and full rent reclamation.**

## Slide 9 — Business Model & Venture Viability (18s)
Our business model is simple: a 1% protocol fee charged only upon successful fundraising. That's 8x cheaper than Kickstarter. At $50M in prototype funding volume, Bestcrow generates $500k in protocol revenue. Future expansions include Token-2022 backer passes and venture syndicate pools. **We are building a venture-scalable capital formation protocol for the global ecosystem.**

## Slide 10 — Why Bestcrow Wins / The Ask (17s)
Bestcrow solves real-world capital formation on Solana with mathematical rigor, cutting-edge Web3.js v2 tech, and immediate venture scalability. **We are applying to the Colosseum Accelerator to turn Bestcrow into the primary crowdfunding standard for the Solana ecosystem.**

---

### Colosseum Judges & VCs Q&A Prep

- **Why Solana instead of an Ethereum L2?**
  * Frequent on-chain milestone voting and micro-pledges require sub-cent transaction fees and instant sub-second finality. Doing contribution-weighted voting for thousands of backers on Ethereum L1 or fragmented L2s would be cost-prohibitive.
- **What happens if a creator abandons the project?**
  * The proof deadline expires. Anyone can permissionlessly call `finalize_proof_timeout` and `terminate`, which freezes remaining unreleased funds into a pro-rata refund pool that backers can claim individually.
- **Can a founder fake votes by pledging 51% to themselves?**
  * A founder who self-funds 51% pays a 1% protocol fee on their own capital and can still only withdraw up to 50% in Tranche 1. They risk more capital than they can extract, making self-rugs economically negative.
- **Why not claim privacy?**
  * Solana transactions, token transfers, and balances are inherently public. Transparency is a feature: backers see the vault balance on Solscan. We promise custodial independence, not anonymity. Digital reward perks (Steam keys) are delivered off-chain.
- **What is the upgrade authority status?**
  * The deployment wallet currently holds the upgrade authority on Devnet. For mainnet, the upgrade authority will be migrated to a community multisig or permanently revoked once audited.
