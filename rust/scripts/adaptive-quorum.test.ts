import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateAdaptiveQuorum } from './adaptive-quorum.js';

const TOTAL_RAISED = 100_000_000_000n; // 100 SOL

test('evaluateAdaptiveQuorum resolves apathy deadlock where passive backers do not vote', () => {
  // Scenario: 40 SOL voted Yes, 0 SOL voted No, 60 SOL remained passive
  const result = evaluateAdaptiveQuorum(TOTAL_RAISED, 40_000_000_000n, 0n);

  assert.equal(result.quorumReached, true, '40% participation exceeds 25% quorum threshold');
  assert.equal(result.approvalBps, 10000, '100% of cast votes voted Yes');
  assert.equal(result.supermajorityReached, true);
  assert.equal(result.outcome, 'APPROVED');

  // Demonstrate that legacy 50% absolute majority would have deadlocked/failed
  assert.equal(result.absoluteMajorityApproved, false, 'Legacy rule (40 SOL * 2 <= 100 SOL) would fail due to apathy');
});

test('evaluateAdaptiveQuorum rejects when total cast votes fall below quorum threshold', () => {
  // Scenario: 15 SOL voted Yes, 0 SOL voted No (< 25% quorum of 100 SOL)
  const result = evaluateAdaptiveQuorum(TOTAL_RAISED, 15_000_000_000n, 0n);

  assert.equal(result.quorumReached, false);
  assert.equal(result.outcome, 'REJECTED_QUORUM');
});

test('evaluateAdaptiveQuorum rejects when cast votes meet quorum but fail supermajority', () => {
  // Scenario: 30 SOL voted (quorum met), but 15 SOL Yes / 15 SOL No (50% approval < 66.67%)
  const result = evaluateAdaptiveQuorum(TOTAL_RAISED, 15_000_000_000n, 15_000_000_000n);

  assert.equal(result.quorumReached, true);
  assert.equal(result.approvalBps, 5000);
  assert.equal(result.supermajorityReached, false);
  assert.equal(result.outcome, 'REJECTED_VOTE');
});

test('evaluateAdaptiveQuorum approves strong consensus above both thresholds', () => {
  // Scenario: 50 SOL voted (50% turnout), 40 SOL Yes / 10 SOL No (80% approval >= 66.67%)
  const result = evaluateAdaptiveQuorum(TOTAL_RAISED, 40_000_000_000n, 10_000_000_000n);

  assert.equal(result.quorumReached, true);
  assert.equal(result.approvalBps, 8000);
  assert.equal(result.supermajorityReached, true);
  assert.equal(result.outcome, 'APPROVED');
});
