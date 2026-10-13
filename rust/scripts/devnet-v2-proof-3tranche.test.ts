import assert from 'node:assert/strict';
import test from 'node:test';
import { web3 } from '@anchor-lang/core';
import { canonicalizeJson } from './devnet-v2-proof-3tranche.js';
import { deriveConfigPda, solscanTransaction, explorerTransaction } from './devnet-v2-common.js';

const { Keypair, PublicKey } = web3;

test('canonicalizeJson sorts keys deterministically', () => {
  const obj1 = { z: 100, b: 2, a: 1 };
  const obj2 = { a: 1, z: 100, b: 2 };
  assert.equal(canonicalizeJson(obj1), canonicalizeJson(obj2));
  assert.equal(canonicalizeJson(obj1), '{"a":1,"b":2,"z":100}');
});

test('3-tranche schedule sums exactly to 10000 bps', () => {
  const tranches = [
    { index: 0, shareBps: 4000 },
    { index: 1, shareBps: 3000 },
    { index: 2, shareBps: 3000 },
  ];
  const totalBps = tranches.reduce((sum, t) => sum + t.shareBps, 0);
  assert.equal(totalBps, 10000);
});

test('solscanTransaction produces valid Solscan Devnet URLs', () => {
  const sampleSig = '5j7K...testSignature';
  const url = solscanTransaction(sampleSig);
  assert.equal(url, `https://solscan.io/tx/${sampleSig}?cluster=devnet`);
});

test('explorerTransaction produces valid Solana Explorer Devnet URLs', () => {
  const sampleSig = '5j7K...testSignature';
  const url = explorerTransaction(sampleSig);
  assert.equal(url, `https://explorer.solana.com/tx/${sampleSig}?cluster=devnet`);
});

test('deriveConfigPda derives deterministic PDA for V2 program', () => {
  const programId = new PublicKey('74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG');
  const configPda = deriveConfigPda(programId);
  assert.equal(configPda.toBase58(), 'AN88jLFTY72ekqGj9Pm3x6rUaMBg1ZNs4dQSLw3eEXN9');
});
