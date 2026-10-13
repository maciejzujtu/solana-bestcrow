export const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
export const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';
export const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

export type BackerTier = 'Bronze' | 'Silver' | 'Gold' | 'Titanium';

export interface BackerPassMetadata {
  name: string;
  symbol: string;
  uri: string;
  attributes: {
    campaign: string;
    backer: string;
    tier: BackerTier;
    pledgedLamports: string;
    votingWeight: string;
    tranchesCompleted: string;
  };
}

export interface BackerPassPlanInput {
  campaign: string;
  backer: string;
  payer: string;
  pledgedLamports: bigint;
  campaignTitle: string;
  tranchesTotal: number;
  tranchesCompleted?: number;
}

/**
 * Derives dynamic contributor tier based on pledged lamports.
 * Bronze:   0.01 SOL – 1 SOL
 * Silver:   1 SOL – 5 SOL
 * Gold:     5 SOL – 20 SOL
 * Titanium: > 20 SOL
 */
export function deriveBackerTier(lamports: bigint): BackerTier {
  const ONE_SOL = 1_000_000_000n;
  if (lamports >= 20n * ONE_SOL) return 'Titanium';
  if (lamports >= 5n * ONE_SOL) return 'Gold';
  if (lamports >= 1n * ONE_SOL) return 'Silver';
  return 'Bronze';
}

/**
 * Computes deterministic Token-2022 mint layout size with MetadataPointer and Metadata extensions.
 * Base Mint: 82 bytes
 * Extension header overhead + Metadata pointer (32 bytes authority + 32 bytes metadata addr) + Metadata TLV
 */
export function calculateToken2022MintSize(metadata: BackerPassMetadata): number {
  const BASE_MINT_SIZE = 82;
  const EXTENSION_HEADER = 4;
  const METADATA_POINTER_SIZE = 64; // authority (32) + metadataAddress (32)
  const metadataJsonBytes = Buffer.from(JSON.stringify(metadata)).length;
  return BASE_MINT_SIZE + EXTENSION_HEADER + METADATA_POINTER_SIZE + metadataJsonBytes;
}

/**
 * Generates the Token-2022 Backer Pass metadata document.
 */
export function buildBackerPassMetadata(input: BackerPassPlanInput): BackerPassMetadata {
  const tier = deriveBackerTier(input.pledgedLamports);
  const completed = input.tranchesCompleted ?? 0;
  return {
    name: `Bestcrow Backer Pass — ${input.campaignTitle}`,
    symbol: 'BCROW',
    uri: `ar://bestcrow-backer-pass/${input.campaign}/${input.backer}`,
    attributes: {
      campaign: input.campaign,
      backer: input.backer,
      tier,
      pledgedLamports: input.pledgedLamports.toString(),
      votingWeight: input.pledgedLamports.toString(),
      tranchesCompleted: `${completed}/${input.tranchesTotal}`,
    },
  };
}

/**
 * Builds the complete instruction plan for issuing a non-transferable Token-2022 Backer Pass.
 */
export function buildToken2022BackerPassPlan(input: BackerPassPlanInput) {
  const metadata = buildBackerPassMetadata(input);
  const estimatedSize = calculateToken2022MintSize(metadata);
  return {
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    mintDecimals: 0,
    mintSupply: 1n,
    metadata,
    estimatedSpace: estimatedSize,
    instructions: [
      {
        name: 'systemCreateAccount',
        programId: SYSTEM_PROGRAM_ID,
        space: estimatedSize,
        owner: TOKEN_2022_PROGRAM_ID,
      },
      {
        name: 'initializeMetadataPointer',
        programId: TOKEN_2022_PROGRAM_ID,
        authority: input.campaign,
      },
      {
        name: 'initializeMint2',
        programId: TOKEN_2022_PROGRAM_ID,
        decimals: 0,
        mintAuthority: input.campaign,
        freezeAuthority: input.campaign,
      },
      {
        name: 'createAssociatedTokenAccount',
        programId: ASSOCIATED_TOKEN_PROGRAM_ID,
        wallet: input.backer,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      },
      {
        name: 'mintToChecked',
        programId: TOKEN_2022_PROGRAM_ID,
        amount: 1n,
        decimals: 0,
        authority: input.campaign,
      },
    ],
  };
}
