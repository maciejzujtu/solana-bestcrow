# Bestcrow Anchor program

The program keeps campaign terms and USDC custody on chain. It has no DAO, proposal, project-token or market account dependency.

## Accounts

- `Campaign` PDA: `["campaign", creator, campaign_id_le]`. Fixed terms, balances, status and up to ten milestones.
- `Vault` SPL Token account PDA: `["vault", campaign]`. Campaign-owned Circle USDC escrow.
- `Backer` PDA: `["backer", campaign, wallet]`. Final contribution and refund receipt.
- `Vote` PDA: `["vote", campaign, milestone_index, wallet]`. One immutable vote per wallet per milestone.

Only the Circle USDC mints on devnet or mainnet are accepted; the mint must have six decimals. Campaigns require five to ten ordered milestones. Kickoff is at most 30% of the goal, each milestone at most 50%, and all allocations sum exactly to the goal.

## Instructions

- `create_campaign`: fixes campaign ID, goal, USDC mint, hash, deadlines, voting duration and payouts.
- `pledge`: transfers USDC from a backer. Exact goal activates the campaign and pays the kickoff tranche.
- `withdraw_pledge`: lets a backer leave during funding before the deadline and goal.
- `finalize_funding`, `cancel_campaign`: mark unsuccessful funding and freeze escrow for refunds.
- `submit_evidence`: creator records a nonzero evidence hash by the milestone deadline and opens voting.
- `cast_vote`: a backer casts Yes/No with their final contribution as weight. The vote PDA prevents duplicate voting.
- `resolve_milestone`: anyone may settle after voting closes. Yes weight must exceed half of *all* raised USDC. If it does, the tranche is paid; otherwise the campaign terminates for refunds.
- `expire_milestone`: anyone may terminate after the creator misses an evidence deadline.
- `claim_refund`: anyone may send a backer's proportional share of remaining escrow to that backer's USDC account.
- `close_vote`, `close_backer`: permissionless receipt cleanup when no longer needed; rent returns to the wallet.
- `sweep_dust`: after all backer refunds, transfer rounding dust to the creator.

Refund entitlement is `floor(contribution * frozen_refund_pool / total_raised)`. Claim order cannot change it. Already released tranches are not refundable. An inactive backer cannot vote; contributions cannot change once a campaign is active.

## Upgrade authority and verification

The Solana upgradeable loader may replace program logic while an upgrade authority exists. Disclose the deployed authority and review policy before accepting funds. This repository currently has no verified v2 deployment. Unit tests and IDL generation do not prove live token transfers.
