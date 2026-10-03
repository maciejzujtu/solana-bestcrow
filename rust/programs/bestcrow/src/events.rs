use anchor_lang::prelude::*;

#[event]
pub struct CampaignCreated {
    pub campaign: Pubkey,
    pub creator: Pubkey,
    pub goal: u64,
    pub funding_deadline: i64,
    pub quote_mint: Pubkey,
}

#[event]
pub struct ContributionChanged {
    pub campaign: Pubkey,
    pub backer: Pubkey,
    pub amount: u64,
    pub withdrawn: bool,
}

#[event]
pub struct CampaignFinalized {
    pub campaign: Pubkey,
    pub succeeded: bool,
}

#[event]
pub struct EvidenceSubmitted {
    pub campaign: Pubkey,
    pub milestone_index: u8,
    pub evidence_hash: [u8; 32],
}

#[event]
pub struct VoteCast {
    pub campaign: Pubkey,
    pub milestone_index: u8,
    pub wallet: Pubkey,
    pub approve: bool,
    pub weight: u64,
}

#[event]
pub struct MilestoneResolved {
    pub campaign: Pubkey,
    pub milestone_index: u8,
    pub approved: bool,
    pub terminated: bool,
}

#[event]
pub struct FundsMoved {
    pub campaign: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
    pub refund: bool,
    pub mint: Pubkey,
}
