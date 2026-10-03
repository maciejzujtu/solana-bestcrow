pub const MIN_MILESTONES: usize = 5;
pub const MAX_MILESTONES: usize = 10;
pub const MAX_INITIAL_RELEASE_BPS: u128 = 3_000;
pub const MAX_MILESTONE_RELEASE_BPS: u128 = 5_000;
pub const BPS_DENOMINATOR: u128 = 10_000;
pub const MIN_VOTE_DURATION_SECS: i64 = 60;
pub const MAX_VOTE_DURATION_SECS: i64 = 30 * 24 * 60 * 60;
use anchor_lang::prelude::Pubkey;

pub const USDC_DEVNET_MINT: Pubkey =
    Pubkey::from_str_const("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
pub const USDC_MAINNET_MINT: Pubkey =
    Pubkey::from_str_const("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
