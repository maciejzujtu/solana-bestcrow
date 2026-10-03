use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum CampaignStatus {
    Funding,
    Active,
    Failed,
    Terminated,
    Completed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MilestoneStatus {
    Pending,
    Reviewing,
    Passed,
    Rejected,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MilestoneInput {
    pub amount: u64,
    pub due_at: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateCampaignArgs {
    pub campaign_id: u64,
    pub goal: u64,
    pub initial_release: u64,
    pub funding_deadline: i64,
    pub vote_duration_secs: i64,
    pub metadata_hash: [u8; 32],
    pub milestones: Vec<MilestoneInput>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct Milestone {
    pub amount: u64,
    pub due_at: i64,
    pub evidence_hash: [u8; 32],
    pub submitted_at: i64,
    pub vote_deadline: i64,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub status: MilestoneStatus,
}

#[account]
pub struct Campaign {
    pub creator: Pubkey,
    pub campaign_id: u64,
    pub quote_mint: Pubkey,
    pub vault: Pubkey,
    pub goal: u64,
    pub total_raised: u64,
    pub escrow_balance: u64,
    pub total_released: u64,
    pub initial_release: u64,
    pub refund_pool: u64,
    pub refund_denominator: u64,
    pub refunded_amount: u64,
    pub funding_deadline: i64,
    pub vote_duration_secs: i64,
    pub metadata_hash: [u8; 32],
    pub current_milestone: u8,
    pub status: CampaignStatus,
    pub backer_count: u32,
    pub refund_claim_count: u32,
    pub bump: u8,
    pub vault_bump: u8,
    pub milestones: Vec<Milestone>,
}

impl Campaign {
    // Covers ten milestones and all fixed fields while leaving modest versioning room.
    pub const SPACE: usize = 8 + 2_048;

    pub fn current(&self) -> Result<&Milestone> {
        self.milestones
            .get(self.current_milestone as usize)
            .ok_or_else(|| error!(crate::error::BestcrowError::WrongMilestone))
    }

    pub fn current_mut(&mut self) -> Result<&mut Milestone> {
        self.milestones
            .get_mut(self.current_milestone as usize)
            .ok_or_else(|| error!(crate::error::BestcrowError::WrongMilestone))
    }

    pub fn freeze_refunds(&mut self, status: CampaignStatus) {
        self.status = status;
        self.refund_pool = self.escrow_balance;
        self.refund_denominator = self.total_raised;
    }
}

#[account]
pub struct Backer {
    pub campaign: Pubkey,
    pub wallet: Pubkey,
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Backer {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 1 + 1;
}

#[account]
pub struct Vote {
    pub campaign: Pubkey,
    pub wallet: Pubkey,
    pub milestone_index: u8,
    pub approve: bool,
    pub weight: u64,
    pub bump: u8,
}

impl Vote {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 1 + 8 + 1;
}
