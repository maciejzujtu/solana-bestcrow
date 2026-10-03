use crate::{
    error::BestcrowError,
    events::{EvidenceSubmitted, FundsMoved, MilestoneResolved},
    policy::vote_passed,
    state::{Campaign, CampaignStatus, MilestoneStatus},
    transfer::transfer_out,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct SubmitEvidence<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator @ BestcrowError::WrongParticipant,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn submit_evidence(ctx: Context<SubmitEvidence>, evidence_hash: [u8; 32]) -> Result<()> {
    require!(evidence_hash != [0; 32], BestcrowError::EmptyEvidence);
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignStatus::Active, BestcrowError::InvalidCampaignState);
    let index = campaign.current_milestone;
    require!(campaign.current()?.status == MilestoneStatus::Pending, BestcrowError::InvalidMilestoneState);
    require!(now <= campaign.current()?.due_at, BestcrowError::DeadlinePassed);
    let deadline = now.checked_add(campaign.vote_duration_secs).ok_or(BestcrowError::Arithmetic)?;
    let milestone = campaign.current_mut()?;
    milestone.evidence_hash = evidence_hash;
    milestone.submitted_at = now;
    milestone.vote_deadline = deadline;
    milestone.status = MilestoneStatus::Reviewing;
    emit!(EvidenceSubmitted {
        campaign: campaign.key(),
        milestone_index: index,
        evidence_hash,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ResolveMilestone<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        has_one = quote_mint @ BestcrowError::InvalidTokenAccount,
        has_one = vault @ BestcrowError::InvalidTokenAccount,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: The address must be the original creator; token account ownership is checked.
    #[account(address = campaign.creator @ BestcrowError::WrongParticipant)]
    pub creator: UncheckedAccount<'info>,
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn resolve_milestone(ctx: Context<ResolveMilestone>) -> Result<()> {
    let campaign_info = ctx.accounts.campaign.to_account_info();
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignStatus::Active, BestcrowError::InvalidCampaignState);
    let index = campaign.current_milestone;
    let milestone = campaign.current()?;
    require!(milestone.status == MilestoneStatus::Reviewing, BestcrowError::InvalidMilestoneState);
    require!(Clock::get()?.unix_timestamp >= milestone.vote_deadline, BestcrowError::VoteOpen);
    if vote_passed(milestone.yes_votes, campaign.total_raised) {
        let amount = milestone.amount;
        transfer_out(
            campaign,
            campaign_info,
            ctx.accounts.vault.to_account_info(),
            ctx.accounts.creator_token.to_account_info(),
            ctx.accounts.quote_mint.to_account_info(),
            ctx.accounts.token_program.to_account_info(),
            amount,
            ctx.accounts.quote_mint.decimals,
        )?;
        campaign.escrow_balance = campaign.escrow_balance.checked_sub(amount).ok_or(BestcrowError::InsufficientEscrow)?;
        campaign.total_released = campaign.total_released.checked_add(amount).ok_or(BestcrowError::Arithmetic)?;
        campaign.current_mut()?.status = MilestoneStatus::Passed;
        campaign.current_milestone = campaign.current_milestone.checked_add(1).ok_or(BestcrowError::Arithmetic)?;
        if campaign.current_milestone as usize == campaign.milestones.len() {
            campaign.status = CampaignStatus::Completed;
        }
        emit!(FundsMoved {
            campaign: campaign.key(), recipient: campaign.creator, amount, refund: false, mint: campaign.quote_mint,
        });
        emit!(MilestoneResolved {
            campaign: campaign.key(), milestone_index: index, approved: true, terminated: false,
        });
    } else {
        campaign.current_mut()?.status = MilestoneStatus::Rejected;
        campaign.freeze_refunds(CampaignStatus::Terminated);
        emit!(MilestoneResolved {
            campaign: campaign.key(), milestone_index: index, approved: false, terminated: true,
        });
    }
    Ok(())
}

#[derive(Accounts)]
pub struct ExpireMilestone<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn expire_milestone(ctx: Context<ExpireMilestone>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignStatus::Active, BestcrowError::InvalidCampaignState);
    let index = campaign.current_milestone;
    let milestone = campaign.current()?;
    require!(milestone.status == MilestoneStatus::Pending, BestcrowError::InvalidMilestoneState);
    require!(Clock::get()?.unix_timestamp > milestone.due_at, BestcrowError::DeadlineOpen);
    campaign.current_mut()?.status = MilestoneStatus::Rejected;
    campaign.freeze_refunds(CampaignStatus::Terminated);
    emit!(MilestoneResolved {
        campaign: campaign.key(), milestone_index: index, approved: false, terminated: true,
    });
    Ok(())
}
