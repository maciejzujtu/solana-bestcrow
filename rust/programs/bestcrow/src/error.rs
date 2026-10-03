use anchor_lang::prelude::*;

#[error_code]
pub enum BestcrowError {
    #[msg("Invalid campaign terms")]
    InvalidTerms,
    #[msg("Campaign is not in the required state")]
    InvalidCampaignState,
    #[msg("Milestone is not in the required state")]
    InvalidMilestoneState,
    #[msg("Funding period has ended")]
    FundingEnded,
    #[msg("Funding period has not ended")]
    FundingOpen,
    #[msg("Campaign goal would be exceeded")]
    GoalExceeded,
    #[msg("Amount must be positive")]
    ZeroAmount,
    #[msg("Wrong creator or backer account")]
    WrongParticipant,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not passed")]
    DeadlineOpen,
    #[msg("Wrong milestone")]
    WrongMilestone,
    #[msg("Arithmetic overflow")]
    Arithmetic,
    #[msg("Escrow balance is insufficient")]
    InsufficientEscrow,
    #[msg("Refund is not available")]
    RefundUnavailable,
    #[msg("Refund already claimed")]
    AlreadyClaimed,
    #[msg("Refunds are still outstanding")]
    RefundsOutstanding,
    #[msg("Evidence hash must be nonzero")]
    EmptyEvidence,
    #[msg("Account is still needed for funding or refund")]
    ReceiptStillNeeded,
    #[msg("Voting period is closed")]
    VoteClosed,
    #[msg("Voting period is still open")]
    VoteOpen,
    #[msg("Token mint, vault, or recipient account does not match the campaign")]
    InvalidTokenAccount,
}
