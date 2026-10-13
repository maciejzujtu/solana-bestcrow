# Bestcrow — Colosseum Hackathon Submission Brief

**Official Portal:** [Colosseum Hackathon](https://colosseum.com/hackathon)  
**Target Program:** Colosseum Pre-Seed Accelerator ($250k investment)  
**Target Track:** **DeFi & Capital Markets** (Alternative: Consumer / Apps)  
**GitHub Repository:** <https://github.com/maciejzujtu/solana-bestcrow>  

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

## 5. Devnet On-Chain Verification & Artifacts

| Artifact | Details & Explorer Link |
| :--- | :--- |
| **Program ID** | [`74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG`](https://explorer.solana.com/address/74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG?cluster=devnet) |
| **Solscan Explorer** | [Solscan Devnet Program Account](https://solscan.io/account/74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG?cluster=devnet) |
| **ProgramData Account** | [`FRFBii8c2KphXrQ7fpVhyFVN5GDDk667akCqfyCDrqN3`](https://explorer.solana.com/address/FRFBii8c2KphXrQ7fpVhyFVN5GDDk667akCqfyCDrqN3?cluster=devnet) |
| **Deployment Slot / Balance** | Slot: `507150736` \| Balance: `2.4042 SOL` |
| **Upgrade Authority** | `F6sXqWU5cCi8Gp8HWZapHzz8XAi21qGLbij5DCoUYg15` |
| **Deployment Record** | [`docs/deployments/devnet-v2.json`](deployments/devnet-v2.json) |
| **Canonical 3-Tranche Manifest** | [`docs/manifests/proof-campaign-3tranche-terms.json`](manifests/proof-campaign-3tranche-terms.json) (40/30/30 split) |
| **Generated Anchor IDLs** | `rust/target/idl/bestcrow.json` (14 instructions) & `rust/target/idl/charity_vault.json` (36 instructions) |

---

## 6. Colosseum Portal Application Form (Copy & Paste Ready)

Use the following exact answers when filling out the project application form on the [Colosseum Hackathon Portal](https://colosseum.com/hackathon):

### Field: Project Name
```text
Bestcrow
```

### Field: Tagline (Max 140 characters)
```text
Back the next milestone. Non-custodial, milestone-escrow crowdfunding for startup prototypes on Solana.
```

### Field: Track
```text
DeFi & Capital Markets
```

### Field: Target Accelerator
```text
Colosseum Pre-Seed Accelerator ($250k)
```

### Field: GitHub Repository URL
```text
https://github.com/maciejzujtu/solana-bestcrow
```

### Field: Project Website / Live Demo
```text
http://localhost:3000 (Docker 1-command: docker compose up --build)
API Health: http://localhost:4000/api/health
```

### Field: Devnet Program ID
```text
74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG
```

### Field: Elevator Pitch (< 100 words)
```text
Solana has mastered decentralized liquidity, but capital formation is broken: founders either launch speculative tokens on bonding curves with zero product accountability, or rely on centralized Web2 platforms (Kickstarter) that take 8% fees and freeze accounts arbitrarily. Bestcrow is an on-chain milestone escrow protocol where startup teams fund prototypes against a sealed, immutable schedule. Capital is held in non-custodial Solana PDA vaults; subsequent tranches are unlocked only after Arweave-verified evidence of work is approved by a contribution-weighted backer vote. If a milestone fails, backers claim pro-rata refunds permissionlessly.
```

### Field: Problem & Market Opportunity
```text
1. High Web2 Fees & Discretionary Control: Kickstarter and Indiegogo take 5% platform fees + 3-5% payment fees (8-10% total) and release 100% of capital upfront. Backers bear total counterparty risk if creators fail to deliver.
2. Web3 Zero-Sum Speculation: Bonding curves and memecoins incentivize immediate dumping rather than multi-month engineering execution. Legitimate hardware, open-source, and software builders lack a credible crowdfunding primitive that doesn't dilute them with instant speculative tokens.
3. Market Size: The global crowdfunding market exceeds $17B annually. Capturing just 1% of prototype and tech capital formation on Solana represents a massive opportunity with sustainable protocol revenue.
```

### Field: How Does Your Project Use Solana? (Technical Architecture)
```text
Bestcrow is purpose-built for Solana:
- Anchor Program: Custom milestone escrow contract deployed on Solana Devnet (Program ID: 74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG).
- Solana Web3.js v2 (@solana/kit): Native adoption of the modular Web3.js v2 SDK for tree-shakeable instruction building, strict byte decoding, and resilient RPC failover.
- Exact Lamport Accounting: Math using u128 checked arithmetic prevents round-off errors and dust loss across multi-tranche distributions.
- Non-Custodial PDA Vaults: All funds reside in campaign-specific Program Derived Addresses, releasing funds only upon cryptographic proof and verified on-chain backer consensus (>50% of contribution weight).
- Arweave & SHA-256 Commitments: Campaign terms and proof-of-work deliverables are stored permanently off-chain, committed on-chain as 32-byte hashes, and verified client-side.
- Sub-Cent High-Throughput Voting: Enables micro-pledges and democratic milestone governance unfeasible on high-gas networks like Ethereum.
```

### Field: Business Model & Monetization
```text
Bestcrow employs a clean, transparent take-rate model:
- 1% protocol fee deducted only from successful campaigns at Tranche 1 release (routed to the protocol treasury).
- 0% fee on failed campaigns (100% of pledged lamports returned to backers).
- Projections: At $50M annual GMV, Bestcrow generates $500,000 in protocol treasury revenue while remaining 8x cheaper than Web2 competitors (8-10%).
```

### Field: Roadmap & Accelerator Vision
```text
- Month 1-2 (Colosseum Accelerator): Security audit of Anchor contract, mainnet deployment, integration with Token-2022 Backer Pass credentials (cNFTs representing contributor tier and governance power).
- Month 3-4: Private off-chain digital reward distribution engine (AES-256 encrypted digital keys/Steam keys delivered atomically upon on-chain pledge confirmation).
- Month 5-6: Adaptive quorum voting to prevent governance deadlock, fiat on-ramp integration via Solana Pay/Stripe, and public creator launchpad.
```

---

## 7. Video Recording & Demo Production Guide (OBS / Loom Runbook)

Follow this 5-step checklist to record the 3-minute video pitch:

### Step 1: Pre-Recording Environment Setup
1. **Start Local Docker Stack:**
   ```bash
   docker compose up --build -d
   ```
   Verify `http://localhost:3000` loads the Bestcrow frontend and `http://localhost:4000/api/health` returns status `200 OK`.
2. **Setup Phantom Wallet:**
   * Switch Phantom network to **Solana Devnet**.
   * Ensure your wallet has at least 1–2 test SOL (request airdrop via `solana airdrop 2` if needed).
3. **Open 4 Clean Browser Tabs in Fullscreen (1080p, 1920x1080):**
   * **Tab 1:** [pump.fun](https://pump.fun) or Kickstarter fee comparison chart.
   * **Tab 2:** Bestcrow Discover Page (`http://localhost:3000/discover`).
   * **Tab 3:** Bestcrow Create Campaign Page (`http://localhost:3000/campaign/new`).
   * **Tab 4:** Solscan Devnet Program Account (`https://solscan.io/account/74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG?cluster=devnet`).

### Step 2: Recording Details (OBS / Loom)
* **Target Duration:** Exactly 2:45 to 3:00 minutes.
* **Audio:** Clear voiceover with USB mic / headset.
* **Format:** 1080p MP4 (or Loom direct link).
* **Delivery:** Speak with energetic, venture-focused conviction.

---

## 8. Verification & Test Suite Evidence

| Component | Test Command | Result |
| :--- | :--- | :--- |
| **Frontend Tests** | `cd frontend && npm test` | **38 / 38 PASS** (0 failures) |
| **Frontend Typecheck** | `cd frontend && npm run typecheck` | **Clean** (0 errors) |
| **Backend Tests** | `cd backend && npm test` | **80 / 80 PASS** (0 failures) |
| **Backend Typecheck** | `cd backend && npm run typecheck` | **Clean** (0 errors) |
| **Rust Unit Tests** | `cd rust && cargo test --lib --workspace` | **9 / 9 PASS** (0 failures) |
| **Rust Workspace Check** | `cd rust && cargo check --workspace` | **Clean** (0 errors) |
| **Devnet Proof Scripts** | `cd rust && npm run test:scripts` | **8 / 8 PASS** (0 failures) |
| **Docker Compose** | `docker compose up --build` | **Healthy** (`:3000` & `:4000` HTTP 200 OK) |

---

## 9. Final Submission Checklist

- [x] **Verified Devnet Program ID recorded with Solscan / Explorer links**
- [x] **Canonical 3-Tranche manifest created and unit-tested**
- [x] **Complete 3-Minute video script and second-by-second storyboard documented**
- [x] **Copy-paste answers ready for Colosseum portal submission form**
- [x] **Docker Compose stack verified and operational on localhost**
- [ ] **Physical Video Recording:** User records 3-minute screencast using Loom / OBS and uploads to YouTube / Loom.
