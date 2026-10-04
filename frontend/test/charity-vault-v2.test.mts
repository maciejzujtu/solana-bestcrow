import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BACKER_LEDGER_V2_SIZE,
  CAMPAIGN_V2_SIZE,
  CLAIM_V2_SIZE,
  MOCK_CONTENT_URI,
  MOCK_TERMS_URI,
  PROGRAM_ID_V2,
  PROTOCOL_CONFIG_V2_SIZE,
  TRANCHE_V2_SIZE,
  VOTE_RECORD_V2_SIZE,
  addTrancheV2Ix,
  arweaveGatewayUrl,
  campaignV2Pda,
  canonicalizeJson,
  canonicalizeTermsV2,
  createCampaignDraftV2Ix,
  decodeCampaignV2Account,
  fetchCampaignContentV2,
  formatSolV2,
  hashCanonicalTermsV2,
  isMockArweaveUri,
  parseSolV2,
  type CampaignTermsV2,
} from '../app/lib/charity-vault-v2.ts';

const TX_ID = 'A'.repeat(43);
const terms: CampaignTermsV2 = {
  schema: 'bestcrow/campaign-terms/v2',
  asset: 'SOL',
  campaign_id: '42',
  creator: PROGRAM_ID_V2,
  goal_lamports: '10000000000',
  funding_duration_seconds: 604800,
  fee_bps: 100,
  vote_duration_seconds: 604800,
  revision_duration_seconds: 2592000,
  second_vote_duration_seconds: 604800,
  first_proof_deadline_seconds: 2592000,
  tranches: [
    { index: 0, share_bps: 5000, proof_period_seconds: 2592000, recipients: [{ address: PROGRAM_ID_V2, share_bps: 10000 }] },
    { index: 1, share_bps: 5000, proof_period_seconds: 2592000, recipients: [{ address: PROGRAM_ID_V2, share_bps: 10000 }] },
  ],
  refund_policy: 'remaining_unreserved_pro_rata_v2',
  content_uri: `ar://${TX_ID}`,
};

test('V2 account sizes match Anchor InitSpace layouts', () => {
  // Independent Borsh arithmetic from funding_v2.rs/lifecycle_v2.rs, including
  // Anchor's 8-byte account discriminator.
  assert.equal(8 + 1 + 32 + 2 + 1, PROTOCOL_CONFIG_V2_SIZE);
  assert.equal(8 + 1 + 32 + 8 + 8 + 8 + 8 + 32 + 4 + 200 + 1 + 1 + 10 + 40 + 40 + 8 + 8 + 8 + 8 + 8 + 8 + 1 + 8 + 8 + 8 + 8 + 1, CAMPAIGN_V2_SIZE);
  assert.equal(8 + 32 + 1 + 2 + 8 + 1 + 5 * 32 + 5 * 2 + 1 + 1 + 1 + 32 + 4 + 200 + 8 + 8 + 8 + 8 + 8 + 1 + 1, TRANCHE_V2_SIZE);
  assert.equal(8 + 32 + 32 + 8 + 1, BACKER_LEDGER_V2_SIZE);
  assert.equal(8 + 32 + 32 + 8 + 8 + 1, CLAIM_V2_SIZE);
  assert.equal(8 + 32 + 32 + 32 + 1 + 1 + 8 + 1, VOTE_RECORD_V2_SIZE);
});

test('Campaign fixture follows the Rust Borsh field order', () => {
  const data = new Uint8Array(CAMPAIGN_V2_SIZE);
  data.set([143, 234, 125, 14, 236, 236, 204, 213], 0);
  data[8] = 2;
  data.set(new Uint8Array(32).fill(7), 9);
  new DataView(data.buffer).setBigUint64(41, 42n, true);
  new DataView(data.buffer).setBigUint64(49, 10_000n, true);
  new DataView(data.buffer).setBigInt64(57, 604_800n, true);
  const decoded = decodeCampaignV2Account(PROGRAM_ID_V2, data);
  assert.equal(decoded.version, 2);
  assert.equal(decoded.campaignId, 42n);
  assert.equal(decoded.goal, 10_000n);
  assert.equal(decoded.fundingDuration, 604_800);
  assert.equal(decoded.status, 'Draft');
  assert.equal(decoded.trancheCount, 0);
});

test('V2 SOL parsing keeps exact integer lamports', () => {
  assert.equal(parseSolV2('0.000000001'), 1n);
  assert.equal(parseSolV2('12.3456789'), 12_345_678_900n);
  assert.equal(formatSolV2(12_345_678_900n), '12.3456789');
  assert.throws(() => parseSolV2('1.0000000001'));
  assert.throws(() => parseSolV2('0'));
});

test('canonical JSON sorts object keys while retaining array order', () => {
  assert.equal(canonicalizeJson({ z: 3, a: { z: 2, a: 1 }, list: [2, 1] }), '{"a":{"a":1,"z":2},"list":[2,1],"z":3}');
  const first = canonicalizeTermsV2(terms);
  const second = canonicalizeTermsV2({ ...terms, schema: terms.schema });
  assert.equal(first, second);
  assert.doesNotMatch(first, /title|description/);
});

test('canonical terms hash is stable and 32 bytes', async () => {
  const first = await hashCanonicalTermsV2(terms);
  const second = await hashCanonicalTermsV2(terms);
  assert.equal(first.length, 32);
  assert.deepEqual(first, second);
});

test('Arweave gateway accepts only a transaction id URI', () => {
  assert.equal(arweaveGatewayUrl(`ar://${TX_ID}`), `https://arweave.net/${TX_ID}`);
  assert.throws(() => arweaveGatewayUrl('https://arweave.net/not-a-tx'));
  assert.throws(() => arweaveGatewayUrl('ar://short'));
});

test('V2 draft and tranche builders use V2 PDAs and discriminators', async () => {
  const campaign = await campaignV2Pda(PROGRAM_ID_V2, 42n);
  const draft = await createCampaignDraftV2Ix(PROGRAM_ID_V2, 42n, 10_000_000_000n, 604800);
  assert.equal(draft.campaign, campaign);
  assert.deepEqual(Array.from(draft.ix.data!.slice(0, 8)), [96, 102, 231, 129, 37, 244, 75, 72]);
  assert.equal(draft.ix.accounts?.length, 5);

  const tranche = await addTrancheV2Ix(PROGRAM_ID_V2, campaign, 0, 5000, 2592000, [PROGRAM_ID_V2], [10000]);
  assert.deepEqual(Array.from(tranche.data!.slice(0, 8)), [182, 203, 140, 5, 149, 0, 7, 143]);
  assert.equal(tranche.accounts?.length, 4);
});

test('Mock Arweave URIs conform to protocol and do not crash on fallback', async () => {
  assert.equal(isMockArweaveUri(MOCK_CONTENT_URI), true);
  assert.equal(isMockArweaveUri(MOCK_TERMS_URI), true);
  assert.equal(isMockArweaveUri(`ar://${'0'.repeat(43)}`), true);
  assert.equal(isMockArweaveUri('https://not-ar'), false);

  assert.doesNotThrow(() => arweaveGatewayUrl(MOCK_CONTENT_URI));
  assert.doesNotThrow(() => arweaveGatewayUrl(MOCK_TERMS_URI));

  const fallback = await fetchCampaignContentV2({
    ...terms,
    content_uri: MOCK_CONTENT_URI,
  });
  assert.equal(typeof fallback.title, 'string');
  assert.equal(typeof fallback.description, 'string');
  assert.equal(fallback.milestones?.length, 2);
});

