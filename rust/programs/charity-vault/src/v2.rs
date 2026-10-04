use anchor_lang::{prelude::*, system_program};

use crate::{constants::*, error::CharityVaultError};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum CampaignV2Status {
    Draft,
    Funding,
    Succeeded,
    Failed,
    Terminated,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum BondV2Status {
    Locked,
    Claimable,
    Forfeited,
    Claimed,
}

#[account]
#[derive(InitSpace)]
pub struct ProtocolConfigV2 {
    pub version: u8,
    pub treasury: Pubkey,
    pub fee_bps: u16,
    pub creator_bond_lamports: u64,
    pub funding_min_seconds: i64,
    pub funding_max_seconds: i64,
    pub vote_duration_seconds: i64,
    pub revision_duration_seconds: i64,
    pub first_proof_deadline_seconds: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CampaignV2 {
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub goal: u64,
    pub funding_deadline: i64,
    pub terms_hash: [u8; 32],
    #[max_len(128)]
    pub terms_uri: Vec<u8>,
    pub status: CampaignV2Status,
    pub sealed: bool,
    pub gross_raised: u64,
    pub final_raised: u64,
    pub fee_paid: u64,
    pub net_budget: u64,
    pub tranche_count: u8,
    pub tranche_cursor: u8,
    pub reserved_claims: u64,
    pub refund_pool: u64,
    pub bond_status: BondV2Status,
    pub bond_claimable_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TrancheV2 {
    pub campaign: Pubkey,
    pub index: u8,
    pub share_bps: u16,
    pub amount_net: u64,
    pub proof_hash: [u8; 32],
    pub proof_deadline: i64,
    pub settled: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct BackerLedgerV2 {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
    pub final_weight: u64,
    pub cancelled: bool,
    pub claimed: bool,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct SplitV2 {
    pub campaign: Pubkey,
    pub tranche_index: u8,
    #[max_len(5)]
    pub recipients: Vec<Pubkey>,
    #[max_len(5)]
    pub shares_bps: Vec<u16>,
    pub bump: u8,
}

fn validate_terms_uri(uri: &[u8]) -> Result<()> {
    require!(uri.len() <= V2_MAX_TERMS_URI_LEN, CharityVaultError::InvalidFundingDuration);
    Ok(())
}

#[derive(Accounts)]
pub struct InitializeProtocolConfigV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfigV2::INIT_SPACE,
        seeds = [CONFIG_V2_SEED],
        bump
    )]
    pub config: Account<'info, ProtocolConfigV2>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_protocol_config_v2(
    ctx: Context<InitializeProtocolConfigV2>,
    treasury: Pubkey,
) -> Result<()> {
    require!(treasury != Pubkey::default(), CharityVaultError::InvalidTreasury);
    let config = &mut ctx.accounts.config;
    config.version = 2;
    config.treasury = treasury;
    config.fee_bps = V2_FEE_BPS;
    config.creator_bond_lamports = V2_CREATOR_BOND_LAMPORTS;
    config.funding_min_seconds = V2_MIN_FUNDING_SECONDS;
    config.funding_max_seconds = V2_MAX_FUNDING_SECONDS;
    config.vote_duration_seconds = 7 * 24 * 60 * 60;
    config.revision_duration_seconds = 30 * 24 * 60 * 60;
    config.first_proof_deadline_seconds = 30 * 24 * 60 * 60;
    config.bump = ctx.bumps.config;
    Ok(())
}

#[derive(Accounts)]
#[instruction(campaign_id: u64)]
pub struct CreateCampaignDraftV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(seeds = [CONFIG_V2_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfigV2>,
    #[account(
        init,
        payer = creator,
        space = 8 + CampaignV2::INIT_SPACE,
        seeds = [CAMPAIGN_V2_SEED, creator.key().as_ref(), &campaign_id.to_le_bytes()],
        bump
    )]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init, payer = creator, space = 0, seeds = [VAULT_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only as a SOL vault.
    pub vault: UncheckedAccount<'info>,
    #[account(init, payer = creator, space = 0, seeds = [BOND_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only for the creator deposit.
    pub bond_vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_campaign_draft_v2(
    ctx: Context<CreateCampaignDraftV2>,
    campaign_id: u64,
    goal: u64,
    funding_deadline: i64,
    terms_hash: [u8; 32],
    terms_uri: Vec<u8>,
) -> Result<()> {
    require!(goal > 0, CharityVaultError::InvalidGoal);
    validate_terms_uri(&terms_uri)?;
    let now = Clock::get()?.unix_timestamp;
    require!(funding_deadline > now, CharityVaultError::InvalidDeadline);
    let duration = funding_deadline
        .checked_sub(now)
        .ok_or(CharityVaultError::ArithmeticOverflow)?;
    require!(
        duration >= V2_MIN_FUNDING_SECONDS && duration <= V2_MAX_FUNDING_SECONDS,
        CharityVaultError::InvalidFundingDuration
    );

    let campaign = &mut ctx.accounts.campaign;
    campaign.creator = ctx.accounts.creator.key();
    campaign.campaign_id = campaign_id;
    campaign.goal = goal;
    campaign.funding_deadline = funding_deadline;
    campaign.terms_hash = terms_hash;
    campaign.terms_uri = terms_uri;
    campaign.status = CampaignV2Status::Draft;
    campaign.sealed = false;
    campaign.gross_raised = 0;
    campaign.final_raised = 0;
    campaign.fee_paid = 0;
    campaign.net_budget = 0;
    campaign.tranche_count = 0;
    campaign.tranche_cursor = 0;
    campaign.reserved_claims = 0;
    campaign.refund_pool = 0;
    campaign.bond_status = BondV2Status::Locked;
    campaign.bond_claimable_at = 0;
    campaign.bump = ctx.bumps.campaign;

    system_program::transfer(
        CpiContext::new(
            system_program::ID,
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.bond_vault.to_account_info(),
            },
        ),
        ctx.accounts.config.creator_bond_lamports,
    )?;
    Ok(())
}

#[derive(Accounts)]
#[instruction(index: u8)]
pub struct AddTrancheV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_V2_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init, payer = creator, space = 8 + TrancheV2::INIT_SPACE, seeds = [TRANCHE_V2_SEED, campaign.key().as_ref(), &[index]], bump)]
    pub tranche: Account<'info, TrancheV2>,
    pub system_program: Program<'info, System>,
}

pub fn add_tranche_v2(
    ctx: Context<AddTrancheV2>,
    index: u8,
    share_bps: u16,
    proof_deadline: i64,
) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(!campaign.sealed && campaign.status == CampaignV2Status::Draft, CharityVaultError::DraftNotEditable);
    require!(index == campaign.tranche_count, CharityVaultError::InvalidTrancheIndex);
    require!((index as usize) < MAX_MILESTONES, CharityVaultError::InvalidTrancheCount);
    require!(share_bps > 0 && share_bps as u64 <= MAX_MILESTONE_BPS, CharityVaultError::InvalidTrancheShare);
    require!(proof_deadline > campaign.funding_deadline, CharityVaultError::InvalidDeadline);
    let tranche = &mut ctx.accounts.tranche;
    tranche.campaign = campaign.key();
    tranche.index = index;
    tranche.share_bps = share_bps;
    tranche.amount_net = 0;
    tranche.proof_hash = [0; 32];
    tranche.proof_deadline = proof_deadline;
    tranche.settled = false;
    tranche.bump = ctx.bumps.tranche;
    campaign.tranche_count = campaign.tranche_count.checked_add(1).ok_or(CharityVaultError::ArithmeticOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct SealTermsV2<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,
    #[account(mut, has_one = creator, seeds = [CAMPAIGN_V2_SEED, creator.key().as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
}

pub fn seal_terms_v2<'info>(ctx: Context<'info, SealTermsV2<'info>>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(!campaign.sealed && campaign.status == CampaignV2Status::Draft, CharityVaultError::TermsAlreadySealed);
    require!((2..=5).contains(&(campaign.tranche_count as usize)), CharityVaultError::InvalidTrancheCount);
    let mut total = 0u64;
    for account_info in ctx.remaining_accounts.iter() {
        if account_info.owner != &crate::ID { continue; }
        let tranche = Account::<TrancheV2>::try_from(account_info)?;
        require_keys_eq!(tranche.campaign, campaign.key(), CharityVaultError::InvalidTrancheIndex);
        total = total.checked_add(tranche.share_bps as u64).ok_or(CharityVaultError::ArithmeticOverflow)?;
    }
    require!(total == BPS_DENOM, CharityVaultError::TrancheSharesDoNotSum);
    require!(ctx.remaining_accounts.len() >= campaign.tranche_count as usize, CharityVaultError::InvalidTrancheCount);
    campaign.sealed = true;
    campaign.status = CampaignV2Status::Funding;
    Ok(())
}

#[derive(Accounts)]
pub struct PledgeV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_V2_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(init_if_needed, payer = backer, space = 8 + BackerLedgerV2::INIT_SPACE, seeds = [BACKER_V2_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only as a SOL vault.
    pub vault: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn pledge_v2(ctx: Context<PledgeV2>, amount: u64) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.sealed && campaign.status == CampaignV2Status::Funding, CharityVaultError::TermsNotSealed);
    require!(now < campaign.funding_deadline, CharityVaultError::DeadlinePassed);
    require!(amount > 0, CharityVaultError::InvalidGoal);
    let ledger = &mut ctx.accounts.ledger;
    if ledger.campaign == Pubkey::default() {
        ledger.campaign = campaign.key();
        ledger.backer = ctx.accounts.backer.key();
        ledger.amount = 0;
        ledger.final_weight = 0;
        ledger.cancelled = false;
        ledger.claimed = false;
        ledger.bump = ctx.bumps.ledger;
    }
    require_keys_eq!(ledger.backer, ctx.accounts.backer.key(), CharityVaultError::DonorNotRegistered);
    ledger.amount = ledger.amount.checked_add(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    ledger.cancelled = false;
    campaign.gross_raised = campaign.gross_raised.checked_add(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    system_program::transfer(CpiContext::new(system_program::ID, system_program::Transfer { from: ctx.accounts.backer.to_account_info(), to: ctx.accounts.vault.to_account_info() }), amount)?;
    Ok(())
}

#[derive(Accounts)]
pub struct CancelPledgeV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_V2_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, seeds = [BACKER_V2_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump, has_one = backer)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only as a SOL vault.
    pub vault: UncheckedAccount<'info>,
}

pub fn cancel_pledge_v2(ctx: Context<CancelPledgeV2>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignV2Status::Funding, CharityVaultError::PledgeCancellationClosed);
    require!(Clock::get()?.unix_timestamp < campaign.funding_deadline, CharityVaultError::PledgeCancellationClosed);
    let ledger = &mut ctx.accounts.ledger;
    require!(ledger.amount > 0, CharityVaultError::NoPledge);
    let amount = ledger.amount;
    ledger.amount = 0;
    ledger.cancelled = true;
    campaign.gross_raised = campaign.gross_raised.checked_sub(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    let vault = ctx.accounts.vault.to_account_info();
    require!(vault.lamports() >= amount, CharityVaultError::InsufficientVaultBalance);
    **vault.try_borrow_mut_lamports()? -= amount;
    let backer = ctx.accounts.backer.to_account_info();
    **backer.try_borrow_mut_lamports()? = backer.lamports().checked_add(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeFundingV2<'info> {
    pub caller: Signer<'info>,
    #[account(mut, seeds = [CONFIG_V2_SEED], bump = config.bump)]
    pub config: Account<'info, ProtocolConfigV2>,
    #[account(mut, seeds = [CAMPAIGN_V2_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, seeds = [VAULT_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only as a SOL vault.
    pub vault: UncheckedAccount<'info>,
    #[account(mut, address = config.treasury)]
    /// CHECK: Fixed treasury configured before campaigns exist.
    pub treasury: UncheckedAccount<'info>,
}

pub fn finalize_funding_v2(ctx: Context<FinalizeFundingV2>) -> Result<()> {
    let campaign = &mut ctx.accounts.campaign;
    require!(campaign.status == CampaignV2Status::Funding, CharityVaultError::CampaignNotFunding);
    require!(Clock::get()?.unix_timestamp >= campaign.funding_deadline, CharityVaultError::DeadlineNotPassed);
    campaign.final_raised = campaign.gross_raised;
    if campaign.gross_raised < campaign.goal {
        campaign.status = CampaignV2Status::Failed;
        campaign.refund_pool = campaign.gross_raised;
        campaign.bond_status = BondV2Status::Claimable;
        campaign.bond_claimable_at = Clock::get()?.unix_timestamp + 7 * 24 * 60 * 60;
        return Ok(());
    }
    let fee = ((campaign.gross_raised as u128) * (ctx.accounts.config.fee_bps as u128) / BPS_DENOM as u128) as u64;
    require!(ctx.accounts.vault.lamports() >= fee, CharityVaultError::InsufficientVaultBalance);
    **ctx.accounts.vault.try_borrow_mut_lamports()? -= fee;
    **ctx.accounts.treasury.try_borrow_mut_lamports()? = ctx.accounts.treasury.lamports().checked_add(fee).ok_or(CharityVaultError::ArithmeticOverflow)?;
    campaign.fee_paid = fee;
    campaign.net_budget = campaign.gross_raised.checked_sub(fee).ok_or(CharityVaultError::ArithmeticOverflow)?;
    campaign.status = CampaignV2Status::Succeeded;
    Ok(())
}

#[derive(Accounts)]
pub struct ClaimRefundV2<'info> {
    #[account(mut)]
    pub backer: Signer<'info>,
    #[account(mut, seeds = [CAMPAIGN_V2_SEED, campaign.creator.as_ref(), &campaign.campaign_id.to_le_bytes()], bump = campaign.bump)]
    pub campaign: Account<'info, CampaignV2>,
    #[account(mut, seeds = [BACKER_V2_SEED, campaign.key().as_ref(), backer.key().as_ref()], bump = ledger.bump, has_one = backer, close = backer)]
    pub ledger: Account<'info, BackerLedgerV2>,
    #[account(mut, seeds = [VAULT_V2_SEED, campaign.key().as_ref()], bump)]
    /// CHECK: PDA owned by this program and used only as a SOL vault.
    pub vault: UncheckedAccount<'info>,
}

pub fn claim_refund_v2(ctx: Context<ClaimRefundV2>) -> Result<()> {
    require!(ctx.accounts.campaign.status == CampaignV2Status::Failed, CharityVaultError::CampaignNotRefunded);
    let ledger = &ctx.accounts.ledger;
    require!(!ledger.claimed && ledger.amount > 0, CharityVaultError::NoPledge);
    let amount = ledger.amount;
    require!(ctx.accounts.vault.lamports() >= amount, CharityVaultError::InsufficientVaultBalance);
    **ctx.accounts.vault.try_borrow_mut_lamports()? -= amount;
    **ctx.accounts.backer.try_borrow_mut_lamports()? = ctx.accounts.backer.lamports().checked_add(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    ctx.accounts.campaign.refund_pool = ctx.accounts.campaign.refund_pool.checked_sub(amount).ok_or(CharityVaultError::ArithmeticOverflow)?;
    Ok(())
}
