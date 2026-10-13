import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Store } from '../../src/db/index.js';
import { RewardRepository } from '../../src/sectors/accounts/rewards/repository.js';
import { RewardService } from '../../src/sectors/accounts/rewards/service.js';

const CREATOR = '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG';
const BACKER = '11111111111111111111111111111111';
const CAMPAIGN = 'So11111111111111111111111111111111111111112';

test('server rewards require a confirmed contribution and are idempotent', () => {
  const store = new Store(':memory:');
  try {
    store.upsertCampaign({ address: CAMPAIGN, creator: CREATOR, campaignId: 1n, goal: 10n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 100), descHash: '00'.repeat(32), raised: 20n,
      paid: false, status: 'succeeded', donorCount: 1, bump: 1, vault: null, vaultLamports: 20n, slot: 1 });
    store.upsertDonor({ campaign: CAMPAIGN, donor: BACKER, amount: 5n, claimed: false, bump: 1 });
    const repo = new RewardRepository(store.db);
    const service = new RewardService(repo, store, () => 10);
    const offer = service.create({ campaign: CAMPAIGN, title: 'Game key', type: 'code', content: 'STEAM-XYZ-999', minAmount: '5', quantity: 1 }, [{ address: CREATOR }]);

    // Verify AES-256 encryption at rest: raw database row must NOT store plaintext 'STEAM-XYZ-999'
    const rawOffer = store.db.prepare('SELECT content FROM reward_offers WHERE id = ?').get(offer.id) as { content: string };
    assert.ok(rawOffer.content.startsWith('enc:v1:'), 'Raw database content must be encrypted with AES-256-GCM format');
    assert.ok(!rawOffer.content.includes('STEAM-XYZ-999'), 'Raw database row must never leak plaintext secret key');

    // Verify public offers list strips private content
    const publicOffers = service.list(CAMPAIGN);
    assert.equal(publicOffers.length, 1);
    assert.equal(publicOffers[0]?.content, null, 'Public offers route must never leak secret content');

    // Verify claim delivers decrypted secret to authorized backer
    const claim = service.claim(offer.id, null, [{ address: BACKER }]);
    assert.equal(claim.status, 'fulfilled');
    assert.equal(claim.deliveredContent, 'STEAM-XYZ-999');

    // Verify stored delivered content in claims table is also encrypted at rest
    const rawClaim = store.db.prepare('SELECT delivered_content FROM reward_claims WHERE id = ?').get(claim.id) as { delivered_content: string };
    assert.ok(rawClaim.delivered_content.startsWith('enc:v1:'), 'Raw claim delivered_content must be encrypted with AES-256-GCM');

    // Idempotency: second claim throws
    assert.throws(() => service.claim(offer.id, null, [{ address: BACKER }]), /already claimed|sold out/);
  } finally { store.close(); }
});
