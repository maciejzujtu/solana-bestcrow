import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TOKEN_2022_PROGRAM_ID,
  buildBackerPassMetadata,
  buildToken2022BackerPassPlan,
  calculateToken2022MintSize,
  deriveBackerTier,
} from './token2022-backer-pass.js';

const CAMPAIGN = 'So11111111111111111111111111111111111111112';
const BACKER = 'F6sXqWU5cCi8Gp8HWZapHzz8XAi21qGLbij5DCoUYg15';
const PAYER = '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG';

test('deriveBackerTier categorizes pledges accurately across tier boundaries', () => {
  const ONE_SOL = 1_000_000_000n;
  assert.equal(deriveBackerTier(100_000_000n), 'Bronze'); // 0.1 SOL
  assert.equal(deriveBackerTier(999_999_999n), 'Bronze');
  assert.equal(deriveBackerTier(1n * ONE_SOL), 'Silver'); // 1 SOL
  assert.equal(deriveBackerTier(4n * ONE_SOL), 'Silver');
  assert.equal(deriveBackerTier(5n * ONE_SOL), 'Gold'); // 5 SOL
  assert.equal(deriveBackerTier(19n * ONE_SOL), 'Gold');
  assert.equal(deriveBackerTier(20n * ONE_SOL), 'Titanium'); // 20 SOL
  assert.equal(deriveBackerTier(50n * ONE_SOL), 'Titanium');
});

test('buildBackerPassMetadata populates dynamic attributes and tranche stamps', () => {
  const metadata = buildBackerPassMetadata({
    campaign: CAMPAIGN,
    backer: BACKER,
    payer: PAYER,
    pledgedLamports: 2_500_000_000n, // 2.5 SOL
    campaignTitle: 'Subsea Autonomous Drone',
    tranchesTotal: 3,
    tranchesCompleted: 1,
  });

  assert.equal(metadata.name, 'Bestcrow Backer Pass — Subsea Autonomous Drone');
  assert.equal(metadata.symbol, 'BCROW');
  assert.equal(metadata.attributes.tier, 'Silver');
  assert.equal(metadata.attributes.pledgedLamports, '2500000000');
  assert.equal(metadata.attributes.tranchesCompleted, '1/3');
  assert.equal(metadata.attributes.campaign, CAMPAIGN);
  assert.equal(metadata.attributes.backer, BACKER);
});

test('calculateToken2022MintSize reserves sufficient space for extensions and TLV', () => {
  const metadata = buildBackerPassMetadata({
    campaign: CAMPAIGN,
    backer: BACKER,
    payer: PAYER,
    pledgedLamports: 10_000_000_000n,
    campaignTitle: 'Exoskeleton Robot',
    tranchesTotal: 4,
    tranchesCompleted: 2,
  });

  const size = calculateToken2022MintSize(metadata);
  assert.ok(size > 200, `Mint size must accommodate extensions, got ${size}`);
  assert.ok(size < 1000, `Mint size should remain reasonably bounded, got ${size}`);
});

test('buildToken2022BackerPassPlan generates sequence of 5 Token-2022 instructions', () => {
  const plan = buildToken2022BackerPassPlan({
    campaign: CAMPAIGN,
    backer: BACKER,
    payer: PAYER,
    pledgedLamports: 25_000_000_000n, // 25 SOL -> Titanium
    campaignTitle: 'OpenSource Satellite',
    tranchesTotal: 3,
  });

  assert.equal(plan.tokenProgram, TOKEN_2022_PROGRAM_ID);
  assert.equal(plan.mintDecimals, 0);
  assert.equal(plan.mintSupply, 1n);
  assert.equal(plan.metadata.attributes.tier, 'Titanium');
  assert.equal(plan.instructions.length, 5);

  const [createAccount, initPointer, initMint, createAta, mintTo] = plan.instructions;
  assert.equal(createAccount.name, 'systemCreateAccount');
  assert.equal(initPointer.name, 'initializeMetadataPointer');
  assert.equal(initMint.name, 'initializeMint2');
  assert.equal(createAta.name, 'createAssociatedTokenAccount');
  assert.equal(mintTo.name, 'mintToChecked');
});
