use crate::{
    error::BestcrowError,
    events::VoteCast,
    state::{Backer, Campaign, CampaignStatus, MilestoneStatus, Vote},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub wallet: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    #[account(
        has_one = campaign @ BestcrowError::WrongParticipant,
        has_one = wallet @ BestcrowError::WrongParticipant,
        seeds = [b"backer", campaign.key().as_ref(), wallet.key().as_ref()],
        bump = backer.bump
    )]
    pub backer: Account<'info, Backer>,
    #[account(
        init,
        payer = wallet,
        space = Vote::SPACE,
        seeds = [b"vote", campaign.key().as_ref(), &[campaign.current_milestone], wallet.key().as_ref()],
        bump
    )]
    pub vote: Account<'info, Vote>,
    pub system_program: Program<'info, System>,
}

pub fn cast_vote(ctx: Context<CastVote>, approve: bool) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignStatus::Active, BestcrowError::InvalidCampaignState);
    require!(ctx.accounts.backer.amount > 0 && !ctx.accounts.backer.claimed, BestcrowError::WrongParticipant);
    let milestone = campaign.current()?;
    require!(milestone.status == MilestoneStatus::Reviewing, BestcrowError::InvalidMilestoneState);
    require!(Clock::get()?.unix_timestamp < milestone.vote_deadline, BestcrowError::VoteClosed);
    let index = campaign.current_milestone;
    let weight = ctx.accounts.backer.amount;
    let milestone = campaign.current_mut()?;
    if approve {
        milestone.yes_votes = milestone.yes_votes.checked_add(weight).ok_or(BestcrowError::Arithmetic)?;
    } else {
        milestone.no_votes = milestone.no_votes.checked_add(weight).ok_or(BestcrowError::Arithmetic)?;
    }
    let vote = &mut ctx.accounts.vote;
    vote.campaign = campaign.key();
    vote.wallet = ctx.accounts.wallet.key();
    vote.milestone_index = index;
    vote.approve = approve;
    vote.weight = weight;
    vote.bump = ctx.bumps.vote;
    emit!(VoteCast {
        campaign: campaign.key(), milestone_index: index, wallet: vote.wallet, approve, weight,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CloseVote<'info> {
    pub caller: Signer<'info>,
    #[account(
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
    /// CHECK: Rent is returned only to the wallet recorded in the vote PDA.
    #[account(mut, address = vote.wallet @ BestcrowError::WrongParticipant)]
    pub wallet: UncheckedAccount<'info>,
    #[account(
        mut,
        close = wallet,
        has_one = campaign @ BestcrowError::WrongParticipant,
        seeds = [b"vote", campaign.key().as_ref(), &[vote.milestone_index], wallet.key().as_ref()],
        bump = vote.bump
    )]
    pub vote: Account<'info, Vote>,
}

pub fn close_vote(ctx: Context<CloseVote>) -> Result<()> {
    let campaign = &ctx.accounts.campaign;
    let vote = &ctx.accounts.vote;
    require!(
        vote.milestone_index < campaign.current_milestone
            || matches!(campaign.status, CampaignStatus::Completed | CampaignStatus::Terminated),
        BestcrowError::ReceiptStillNeeded
    );
    Ok(())
}
