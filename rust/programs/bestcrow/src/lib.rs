#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod policy;
pub mod state;
pub mod transfer;

use instructions::*;
use state::CreateCampaignArgs;

declare_id!("EousWVK2cePYb9zvv1oWSca4VNdRQqYef8CsxQ6BL57R");

#[program]
pub mod bestcrow {
    use super::*;

    pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
        instructions::campaign::create_campaign(ctx, args)
    }
    pub fn pledge(ctx: Context<Pledge>, amount: u64) -> Result<()> {
        instructions::funding::pledge(ctx, amount)
    }
    pub fn withdraw_pledge(ctx: Context<WithdrawPledge>, amount: u64) -> Result<()> {
        instructions::funding::withdraw_pledge(ctx, amount)
    }
    pub fn close_backer(ctx: Context<CloseBacker>) -> Result<()> {
        instructions::funding::close_backer(ctx)
    }
    pub fn finalize_funding(ctx: Context<FinalizeFunding>) -> Result<()> {
        instructions::campaign::finalize_funding(ctx)
    }
    pub fn cancel_campaign(ctx: Context<CancelCampaign>) -> Result<()> {
        instructions::campaign::cancel_campaign(ctx)
    }
    pub fn submit_evidence(ctx: Context<SubmitEvidence>, evidence_hash: [u8; 32]) -> Result<()> {
        instructions::milestone::submit_evidence(ctx, evidence_hash)
    }
    pub fn cast_vote(ctx: Context<CastVote>, approve: bool) -> Result<()> {
        instructions::voting::cast_vote(ctx, approve)
    }
    pub fn close_vote(ctx: Context<CloseVote>) -> Result<()> {
        instructions::voting::close_vote(ctx)
    }
    pub fn resolve_milestone(ctx: Context<ResolveMilestone>) -> Result<()> {
        instructions::milestone::resolve_milestone(ctx)
    }
    pub fn expire_milestone(ctx: Context<ExpireMilestone>) -> Result<()> {
        instructions::milestone::expire_milestone(ctx)
    }
    pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
        instructions::refunds::claim_refund(ctx)
    }
    pub fn sweep_dust(ctx: Context<SweepDust>) -> Result<()> {
        instructions::refunds::sweep_dust(ctx)
    }
}
