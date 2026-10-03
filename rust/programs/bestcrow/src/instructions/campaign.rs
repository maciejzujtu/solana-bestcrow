use crate::{
    constants::{USDC_DEVNET_MINT, USDC_MAINNET_MINT},
    error::BestcrowError,
    events::{CampaignCreated, CampaignFinalized},
    policy::validate_terms,
    state::{Campaign, CampaignStatus, CreateCampaignArgs, Milestone, MilestoneStatus},
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Mint, Token, TokenAccount},
};

#[derive(Accounts)]
#[instruction(args: CreateCampaignArgs)]
pub struct CreateCampaign<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(
        init,
        payer = creator,
        space = Campaign::SPACE,
        seeds = [b"campaign", creator.key().as_ref(), &args.campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Box<Account<'info, Campaign>>,
    pub quote_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = creator,
        seeds = [b"vault", campaign.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = campaign
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = creator
    )]
    pub creator_token: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_campaign(ctx: Context<CreateCampaign>, args: CreateCampaignArgs) -> Result<()> {
    validate_terms(&args, Clock::get()?.unix_timestamp)?;
    require!(
        ctx.accounts.quote_mint.key() == USDC_DEVNET_MINT
            || ctx.accounts.quote_mint.key() == USDC_MAINNET_MINT,
        BestcrowError::InvalidTokenAccount
    );
    require!(
        ctx.accounts.quote_mint.decimals == 6,
        BestcrowError::InvalidTokenAccount
    );
    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = args.campaign_id;
    campaign.quote_mint = ctx.accounts.quote_mint.key();
    campaign.vault = ctx.accounts.vault.key();
    campaign.goal = args.goal;
    campaign.total_raised = 0;
    campaign.escrow_balance = 0;
    campaign.total_released = 0;
    campaign.initial_release = args.initial_release;
    campaign.refund_pool = 0;
    campaign.refund_denominator = 0;
    campaign.refunded_amount = 0;
    campaign.funding_deadline = args.funding_deadline;
    campaign.vote_duration_secs = args.vote_duration_secs;
    campaign.metadata_hash = args.metadata_hash;
    campaign.current_milestone = 0;
    campaign.status = CampaignStatus::Funding;
    campaign.backer_count = 0;
    campaign.refund_claim_count = 0;
    campaign.bump = ctx.bumps.campaign;
    campaign.vault_bump = ctx.bumps.vault;
    campaign.milestones = args
        .milestones
        .into_iter()
        .map(|input| Milestone {
            amount: input.amount,
            due_at: input.due_at,
            evidence_hash: [0; 32],
            submitted_at: 0,
            vote_deadline: 0,
            yes_votes: 0,
            no_votes: 0,
            status: MilestoneStatus::Pending,
        })
        .collect();

    emit!(CampaignCreated {
        campaign: campaign.key(),
        creator: campaign.creator,
        goal: campaign.goal,
        funding_deadline: campaign.funding_deadline,
        quote_mint: campaign.quote_mint,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeFunding<'info> {
    pub caller: Signer<'info>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn finalize_funding(ctx: Context<FinalizeFunding>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    require!(
        Clock::get()?.unix_timestamp >= campaign.funding_deadline,
        BestcrowError::FundingOpen
    );
    require!(
        campaign.total_raised < campaign.goal,
        BestcrowError::InvalidCampaignState
    );
    campaign.freeze_refunds(CampaignStatus::Failed);
    emit!(CampaignFinalized {
        campaign: campaign.key(),
        succeeded: false
    });
    Ok(())
}

#[derive(Accounts)]
pub struct CancelCampaign<'info> {
    pub creator: Signer<'info>,
    #[account(
        mut,
        has_one = creator @ BestcrowError::WrongParticipant,
        seeds = [b"campaign", campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,
}

pub fn cancel_campaign(ctx: Context<CancelCampaign>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(
        campaign.status == CampaignStatus::Funding,
        BestcrowError::InvalidCampaignState
    );
    campaign.freeze_refunds(CampaignStatus::Failed);
    emit!(CampaignFinalized {
        campaign: campaign.key(),
        succeeded: false
    });
    Ok(())
}
