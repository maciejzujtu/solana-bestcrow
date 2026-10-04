use anchor_lang::prelude::*;

#[error_code]
pub enum CharityVaultError {
    #[msg("Goal must be greater than zero")]
    InvalidGoal,
    #[msg("Deadline must be in the future")]
    InvalidDeadline,
    #[msg("Campaign is not active")]
    CampaignNotActive,
    #[msg("Campaign deadline has passed")]
    DeadlinePassed,
    #[msg("Campaign deadline has not passed")]
    DeadlineNotPassed,
    #[msg("Campaign has not succeeded")]
    CampaignNotSucceeded,
    #[msg("Campaign has not failed")]
    CampaignNotRefunded,
    #[msg("Campaign is not staged")]
    CampaignNotStaged,
    #[msg("Campaign has been terminated")]
    CampaignTerminated,
    #[msg("Campaign has not been terminated")]
    CampaignNotTerminated,
    #[msg("Goal must be met before milestones can be released")]
    GoalNotReached,
    #[msg("Goal was reached")]
    GoalReached,
    #[msg("Donation would exceed the campaign goal")]
    GoalOverflow,
    #[msg("Donor registry is full")]
    DonorRegistryFull,
    #[msg("Donor is not registered for this campaign")]
    DonorNotRegistered,
    #[msg("Refund has already been claimed")]
    AlreadyClaimed,
    #[msg("The refund_all account list is invalid")]
    InvalidRefundAccounts,
    #[msg("Insufficient vault balance")]
    InsufficientVaultBalance,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
    #[msg("Too many milestones")]
    TooManyMilestones,
    #[msg("Milestone index is out of range")]
    InvalidMilestoneIndex,
    #[msg("Milestone amount exceeds half of the base budget")]
    MilestoneExceedsHalf,
    #[msg("Milestone allocations exceed the base budget")]
    MilestoneSumExceedsBudget,
    #[msg("Milestone is not in the right state for this action")]
    InvalidMilestoneStatus,
    #[msg("Only the campaign creator may do this")]
    UnauthorizedCreator,
    #[msg("Vote weight exceeds the campaign total")]
    VoteWeightExceedsRaised,
    #[msg("This donor already voted on the milestone")]
    AlreadyVoted,
    #[msg("The split configuration is invalid")]
    InvalidSplit,
    #[msg("Nothing has vested yet")]
    NothingVested,
    #[msg("The recipient is not part of this split")]
    InvalidRecipient,
    #[msg("The bond may not be claimed in this state")]
    BondUnavailable,
    #[msg("The campaign has no bond")]
    NoBond,
    #[msg("Staged campaigns release funds through milestones")]
    StagedCampaignUsesMilestones,
    #[msg("Protocol configuration already exists")]
    ProtocolConfigExists,
    #[msg("Campaign draft is not editable")]
    DraftNotEditable,
    #[msg("Campaign terms are not sealed")]
    TermsNotSealed,
    #[msg("Campaign terms are already sealed")]
    TermsAlreadySealed,
    #[msg("Funding duration must be between seven and 183 days")]
    InvalidFundingDuration,
    #[msg("A campaign must contain between two and five tranches")]
    InvalidTrancheCount,
    #[msg("Tranche share must be positive and no more than 50 percent")]
    InvalidTrancheShare,
    #[msg("Tranche shares must sum to 100 percent")]
    TrancheSharesDoNotSum,
    #[msg("The tranche index is not sequential")]
    InvalidTrancheIndex,
    #[msg("The protocol fee is invalid")]
    InvalidProtocolFee,
    #[msg("The protocol treasury is invalid")]
    InvalidTreasury,
    #[msg("The pledge has already been cancelled")]
    PledgeAlreadyCancelled,
    #[msg("The pledge cannot be cancelled after funding")]
    PledgeCancellationClosed,
    #[msg("No pledge is available")]
    NoPledge,
    #[msg("The campaign is not in V2 funding")]
    CampaignNotFunding,
    #[msg("The campaign has already been finalized")]
    CampaignAlreadyFinalized,
}
