# Bestcrow — Colosseum Hackathon Submission Brief

**Official Portal:** [Colosseum Hackathon](https://colosseum.com/hackathon)  
**Target Program:** Colosseum Pre-Seed Accelerator ($250k investment)  
**Target Track:** **DeFi & Capital Markets** (Alternative: Consumer / Apps)

---

## 1. Project Overview & Meta Information

* **Project Name:** Bestcrow
* **Tagline:** Back the next milestone. Non-custodial, milestone-escrow crowdfunding for startup prototypes on Solana.
* **Elevator Pitch (100 words):**  
  Solana has mastered decentralized liquidity, but capital formation is broken: founders either launch speculative tokens on bonding curves with zero product accountability, or rely on centralized Web2 platforms (Kickstarter) that take 8% fees and freeze accounts arbitrarily. Bestcrow is an on-chain milestone escrow protocol where startup teams fund prototypes against a sealed, immutable schedule. Capital is held in non-custodial Solana PDA vaults; subsequent tranches are unlocked only after Arweave-verified evidence of work is approved by a contribution-weighted backer vote. If a milestone fails, backers claim pro-rata refunds permissionlessly.

---

## 2. Problem Statement & Market Opportunity

1. **The Web2 Crowdfunding Dilemma:**
   * Traditional platforms (Kickstarter, Indiegogo) charge **5% platform fees + 3–5% payment processing**, exercise discretionary account freezes, and remit 100% of funds upfront—leaving backers vulnerable to creator abandonment with zero recourse.
2. **The Web3 Capital Formation Gap ("Post-Meme Thesis"):**
   * Solana has driven massive attention through memecoins and speculative tokens, but legitimate hardware, open-source, and software builders lack a credible crowdfunding primitive that doesn't dilute them with instant speculative tokens.
3. **The Solution:**
   * **Programmed Trust:** Milestone releases governed by mathematical rules rather than human administrators.
   * **1% Platform Fee:** 8x cheaper than Web2 alternatives, capturing protocol revenue sustainably.
   * **Sub-Cent Voting:** High-frequency, contribution-weighted on-chain governance made possible only by Solana's high-throughput architecture.

---

## 3. Key Solana Innovations & Technical Highlights

* **Built with Solana Web3.js v2 (`@solana/kit`):**
  * One of the first hackathon submissions natively adopting the new modular `@solana/kit` SDK for tree-shakeable instruction generation, strict byte decoding, and resilient RPC failover.
* **Exact Lamport Accounting:**
  * Uses `u128` checked math to ensure zero lamport loss or underflow across percentage divisions, deterministically sweeping remainder dust to the final tranche.
* **Permanent Verifiable Proofs:**
  * Terms documents and milestone delivery deliverables are stored on Arweave and committed to on-chain accounts via 32-byte SHA-256 hashes (`terms_hash`, `evidence_hash`), client-verified before user voting.
* **Permissionless State Settlement:**
  * No centralized keeper or cron job can hold a campaign hostage. When deadlines expire, any caller can trigger timeout finalizations or claim individual refunds.
* **Dual-Mode UX:**
  * **Devnet Mode:** Signs real transactions via Phantom using test SOL, linking confirmed signatures directly to **Solscan** and **Solana Explorer**.
  * **Mock Mode:** Dedicated sandbox for instant walkthrough without test SOL.

---

## 4. 3-Minute Video Pitch & Demo Script (For Colosseum Judges)

| Timestamp | Screen / Visual | Voiceover Script |
| :--- | :--- | :--- |
| **0:00 – 0:35** | **The Void in Capital Formation**<br>*(Show pump.fun chart vs Kickstarter 8% fee page)* | *"Solana has revolutionized trading speed and liquidity, but early-stage capital formation is broken. Right now, founders either launch zero-sum tokens with zero product accountability, or use Kickstarter, which takes 8% in fees, exercises discretionary freezes, and hands 100% of money upfront to founders who might never deliver. We built Bestcrow: non-custodial milestone crowdfunding for real builders."* |
| **0:35 – 1:15** | **Creating a Campaign on Bestcrow**<br>*(Show `/campaign/new` on Devnet)* | *"On Bestcrow, founders lock a 2 to 5 tranche schedule before a single dollar is raised. Here, a robotics team creates a 3-tranche campaign: 30% initial runway, 40% prototype completion, and 30% final manufacturing. All terms are hashed and committed on-chain. Funding runs 7 to 183 days with full overfunding support."* |
| **1:15 – 1:55** | **Pledging & Explorer Verification**<br>*(Pledge test SOL in Phantom, show Solscan link)* | *"Backers pledge SOL directly into a program-owned PDA vault. Phantom signs the transaction on Devnet, and within 400 milliseconds, the pledge is confirmed. Backers can view the exact signature on Solscan Devnet. If the goal is missed, backers claim a 100% refund with zero platform fee. If it succeeds, the protocol charges a 1% fee once to treasury, and releases Tranche 1."* |
| **1:55 – 2:30** | **Milestone Governance & Proof of Work**<br>*(Show `/campaign/[address]` voting UI)* | *"When Tranche 2 is due, the creator submits proof of work stored permanently on Arweave. The frontend hashes the content, verifies it against the on-chain commitment, and opens a 7-day vote. Approval requires strictly over 50% of all contribution weight. If rejected, the founder gets a 30-day revision window. If rejected again, anyone can trigger termination, and backers claim pro-rata refunds."* |
| **2:30 – 3:00** | **Tech Stack & The Colosseum Accelerator Vision**<br>*(Show architecture diagram & roadmap)* | *"Bestcrow is written in Anchor and modern `@solana/kit` Web3.js v2 with 100% test coverage. Our business model is simple: a 1% protocol take rate. With $50M raised across hardware and tech prototypes, Bestcrow generates $500k in protocol revenue. We're applying to the Colosseum Accelerator to bring milestone-driven crowdfunding to the global Solana ecosystem."* |

---

## 5. Repository & Verification Checklist

- [x] **Repository:** <https://github.com/maciejzujtu/solana-bestcrow>
- [x] **Frontend Tests:** 38/38 passing (`cd frontend && npm test`)
- [x] **Backend Tests:** 80/80 passing (`cd backend && npm test`)
- [x] **Smart Contract Tests:** Rust unit tests passing (`cd rust && cargo test --workspace`)
- [x] **Docker Compose:** Starts seamlessly via `docker compose up --build`
- [x] **Explorer Links:** Active links to Solscan Devnet & Solana Explorer
- [x] **Master Specification:** Comprehensive technical specification in [`docs/DEVELOPMENT_PLAN.md`](DEVELOPMENT_PLAN.md)
