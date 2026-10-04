'use client';

import { address, type Address } from '@solana/kit';

import {
  DAY_SECONDS,
  FEE_BPS_V2,
  type BackerLedgerV2,
  type CampaignContentV2,
  type CampaignTermsV2,
  type CampaignV2,
  type FundingStatusV2,
  type TrancheV2,
} from './charity-vault-v2';

type MockMilestone = { title: string; shareBps: number; proofPeriodSeconds: number };
type MockCampaignRecord = {
  address: string;
  creator: string;
  campaignId: string;
  title: string;
  description: string;
  goal: string;
  raised: string;
  fundingDeadline: number;
  status: FundingStatusV2;
  milestones: MockMilestone[];
};

export type MockCampaignBundle = {
  campaign: CampaignV2;
  tranches: TrancheV2[];
  terms: CampaignTermsV2;
  content: CampaignContentV2;
};

const CAMPAIGNS_KEY = 'bestcrow:mock-campaigns-v2';
const PLEDGES_KEY = 'bestcrow:mock-pledges-v2';
const now = Math.floor(Date.now() / 1000);

const samples: MockCampaignRecord[] = [
  {
    address: 'Stake11111111111111111111111111111111111111',
    creator: 'Vote111111111111111111111111111111111111111',
    campaignId: '101',
    title: 'Solar Mesh Warsaw',
    description: 'Neighborhood solar hubs with shared batteries for apartment buildings and small local businesses.',
    goal: '120000000000',
    raised: '76400000000',
    fundingDeadline: now + 24 * DAY_SECONDS,
    status: 'Funding',
    milestones: [
      { title: 'Hardware and permits', shareBps: 5000, proofPeriodSeconds: 30 * DAY_SECONDS },
      { title: 'First three building installations', shareBps: 5000, proofPeriodSeconds: 45 * DAY_SECONDS },
    ],
  },
  {
    address: 'Config1111111111111111111111111111111111111',
    creator: 'BPFLoaderUpgradeab1e11111111111111111111111',
    campaignId: '102',
    title: 'OpenLab Diagnostics',
    description: 'An open hardware diagnostic reader designed for clinics that need affordable, repairable equipment.',
    goal: '85000000000',
    raised: '52800000000',
    fundingDeadline: now + 41 * DAY_SECONDS,
    status: 'Funding',
    milestones: [
      { title: 'Clinical prototype', shareBps: 4000, proofPeriodSeconds: 30 * DAY_SECONDS },
      { title: 'Calibration study', shareBps: 3000, proofPeriodSeconds: 45 * DAY_SECONDS },
      { title: 'Pilot manufacturing run', shareBps: 3000, proofPeriodSeconds: 60 * DAY_SECONDS },
    ],
  },
  {
    address: 'AddressLookupTab1e1111111111111111111111111',
    creator: 'ComputeBudget111111111111111111111111111111',
    campaignId: '103',
    title: 'Refill Loop',
    description: 'Reusable packaging stations for independent food shops, with public waste-reduction reporting.',
    goal: '45000000000',
    raised: '51200000000',
    fundingDeadline: now + 12 * DAY_SECONDS,
    status: 'Funding',
    milestones: [
      { title: 'Station production', shareBps: 5000, proofPeriodSeconds: 21 * DAY_SECONDS },
      { title: 'Ten-shop rollout', shareBps: 5000, proofPeriodSeconds: 45 * DAY_SECONDS },
    ],
  },
];

const trancheAddresses = [
  'SysvarRent111111111111111111111111111111111',
  'SysvarC1ock11111111111111111111111111111111',
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
  'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr',
] as const;

function storedCampaigns(): MockCampaignRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const value = JSON.parse(localStorage.getItem(CAMPAIGNS_KEY) ?? '[]');
    return Array.isArray(value) ? value as MockCampaignRecord[] : [];
  } catch { return []; }
}

function pledgeAmounts(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const value = JSON.parse(localStorage.getItem(PLEDGES_KEY) ?? '{}');
    return value && typeof value === 'object' ? value as Record<string, string> : {};
  } catch { return {}; }
}

function bundle(record: MockCampaignRecord): MockCampaignBundle {
  const campaignAddress = address(record.address);
  const creator = address(record.creator);
  const localPledge = BigInt(pledgeAmounts()[record.address] ?? '0');
  const raised = BigInt(record.raised) + localPledge;
  const goal = BigInt(record.goal);
  const shares = record.milestones.map((item) => item.shareBps);
  const proofPeriods = record.milestones.map((item) => item.proofPeriodSeconds);
  const campaign: CampaignV2 = {
    address: campaignAddress, version: 2, creator, campaignId: BigInt(record.campaignId), goal,
    fundingDuration: 30 * DAY_SECONDS, fundingDeadline: record.fundingDeadline,
    termsHash: new Uint8Array(32).fill(1), termsUri: `ar://mock_terms_${record.campaignId.padStart(32, '0')}`,
    status: record.status, trancheCount: record.milestones.length,
    sharesBps: [...shares, ...Array(5 - shares.length).fill(0)],
    proofPeriods: [...proofPeriods, ...Array(5 - proofPeriods.length).fill(0)],
    trancheAmounts: Array(5).fill(0n), raised, finalRaised: 0n, feePaid: 0n, netBudget: 0n,
    settledAt: 0, firstProofDeadline: 0, currentTranche: 0, proofDeadline: 0,
    reserved: 0n, refundPool: 0n, refundsPaid: 0n, bump: 255,
  };
  const tranches = record.milestones.map((item, index): TrancheV2 => ({
    address: address(trancheAddresses[index]!), campaign: campaignAddress, index,
    shareBps: item.shareBps, proofPeriodSeconds: item.proofPeriodSeconds,
    recipients: [creator], recipientSharesBps: [10_000], settled: false,
    status: 'Pending', round: 0, evidenceHash: new Uint8Array(32), evidenceUri: '',
    voteStart: 0, voteEnd: 0, revisionEnd: 0, approveWeight: 0n, rejectWeight: 0n,
    claimCreated: false, bump: 255,
  }));
  const terms: CampaignTermsV2 = {
    schema: 'bestcrow/campaign-terms/v2', asset: 'SOL', campaign_id: record.campaignId,
    creator, goal_lamports: record.goal, funding_duration_seconds: campaign.fundingDuration,
    fee_bps: FEE_BPS_V2, vote_duration_seconds: 604800, revision_duration_seconds: 2592000,
    second_vote_duration_seconds: 604800, first_proof_deadline_seconds: 2592000,
    tranches: record.milestones.map((item, index) => ({
      index, share_bps: item.shareBps, proof_period_seconds: item.proofPeriodSeconds,
      recipients: [{ address: creator, share_bps: 10_000 }],
    })),
    refund_policy: 'remaining_unreserved_pro_rata_v2', content_uri: 'ar://mock_content_000000000000000000000000000000',
  };
  return { campaign, tranches, terms, content: { title: record.title, description: record.description, milestones: record.milestones.map(({ title }) => ({ title })) } };
}

export function getMockCampaignsV2(): MockCampaignBundle[] {
  const byAddress = new Map([...samples, ...storedCampaigns()].map((record) => [record.address, record]));
  return [...byAddress.values()].map(bundle);
}

export function getMockCampaignV2(campaignAddress: Address): MockCampaignBundle | null {
  return getMockCampaignsV2().find(({ campaign }) => campaign.address === campaignAddress) ?? null;
}

export function saveMockCampaignV2(record: Omit<MockCampaignRecord, 'raised' | 'fundingDeadline' | 'status'> & { fundingDuration: number }): void {
  if (typeof window === 'undefined') return;
  const next: MockCampaignRecord = { ...record, raised: '0', fundingDeadline: Math.floor(Date.now() / 1000) + record.fundingDuration, status: 'Funding' };
  const campaigns = storedCampaigns().filter((item) => item.address !== record.address);
  localStorage.setItem(CAMPAIGNS_KEY, JSON.stringify([next, ...campaigns]));
}

export function pledgeToMockCampaignV2(campaignAddress: Address, amount: bigint): void {
  if (amount <= 0n) throw new Error('Pledge must be positive.');
  const pledges = pledgeAmounts();
  pledges[campaignAddress] = (BigInt(pledges[campaignAddress] ?? '0') + amount).toString();
  localStorage.setItem(PLEDGES_KEY, JSON.stringify(pledges));
}

export function getMockPledgeV2(campaignAddress: Address, backer: Address): BackerLedgerV2 | null {
  const amount = BigInt(pledgeAmounts()[campaignAddress] ?? '0');
  return amount > 0n ? { address: backer, campaign: campaignAddress, backer, amount, bump: 255 } : null;
}
