pub const CAMPAIGN_SEED: &[u8] = b"campaign";
pub const DONOR_SEED: &[u8] = b"donor";
pub const VAULT_SEED: &[u8] = b"vault";
pub const BOND_SEED: &[u8] = b"bond";
pub const MILESTONE_SEED: &[u8] = b"milestone";
pub const VOTE_SEED: &[u8] = b"vote";
pub const SPLIT_SEED: &[u8] = b"split";
pub const CLAIM_SEED: &[u8] = b"claim";
// Version 2 uses separate PDA namespaces so legacy campaigns remain readable.
pub const CONFIG_V2_SEED: &[u8] = b"config-v2";
pub const CAMPAIGN_V2_SEED: &[u8] = b"campaign-v2";
pub const TRANCHE_V2_SEED: &[u8] = b"tranche-v2";
pub const BACKER_V2_SEED: &[u8] = b"backer-v2";
pub const VAULT_V2_SEED: &[u8] = b"vault-v2";
pub const BOND_V2_SEED: &[u8] = b"bond-v2";
pub const SPLIT_V2_SEED: &[u8] = b"split-v2";
pub const CLAIM_V2_SEED: &[u8] = b"claim-v2";
pub const VOTE_V2_SEED: &[u8] = b"vote-v2";

/// Maximum number of distinct donors per campaign.
///
/// Capped at 12 so the batched `refund_all` instruction stays inside the
/// 1232-byte legacy transaction limit. That instruction needs two remaining
/// accounts per donor (the ledger and the recipient) on top of its fixed
/// accounts; including compute-budget instructions and a possible second
/// signer, 12 donors serialize to roughly 1100 bytes. Raising this limit
/// requires sending a v0/v1 transaction with an address lookup table or adding
/// a paginated refund instruction.
pub const MAX_DONORS: usize = 12;
pub const MAX_DESCRIPTION_HASH_LEN: usize = 32;

/// Bundle A — staged funding limits.
pub const MAX_MILESTONES: usize = 5;
pub const MAX_SPLIT_RECIPIENTS: usize = 5;
pub const BPS_DENOM: u64 = 10_000;
pub const V2_FEE_BPS: u16 = 100;
pub const V2_CREATOR_BOND_LAMPORTS: u64 = 100_000_000;
pub const V2_MIN_FUNDING_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const V2_MAX_FUNDING_SECONDS: i64 = 183 * 24 * 60 * 60;
pub const V2_MAX_TERMS_URI_LEN: usize = 128;
/// A milestone vote needs 70% of the campaign's raised weight to release.
pub const APPROVE_BPS: u64 = 7_000;
/// No single milestone may allocate more than 50% of the base budget.
pub const MAX_MILESTONE_BPS: u64 = 5_000;
