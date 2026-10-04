import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getBase64Encoder,
  getProgramDerivedAddress,
  type Address,
  type Instruction,
} from '@solana/kit';

import type { AppClient } from '../providers';
import { withRpcRetry } from './rpc-retry.ts';

export const PROGRAM_ID_V2 = address(
  process.env.NEXT_PUBLIC_CHARITY_VAULT_PROGRAM_ID || '74GsU9xRv9qvVHXXvTAAmRp8ETTEAwGjV1UkJQ6BZNpG',
);
export const SYSTEM_PROGRAM = address('11111111111111111111111111111111');
export const CAMPAIGN_V2_SIZE = 483;
export const TRANCHE_V2_SIZE = 503;
export const BACKER_LEDGER_V2_SIZE = 81;
export const VOTE_RECORD_V2_SIZE = 115;
export const CLAIM_V2_SIZE = 89;
export const PROTOCOL_CONFIG_V2_SIZE = 44;
export const FEE_BPS_V2 = 100;
export const BPS_DENOMINATOR = 10_000;
export const MAX_TRANCHES_V2 = 5;
export const MAX_RECIPIENTS_V2 = 5;
export const DAY_SECONDS = 86_400;

const MAX_U64 = (1n << 64n) - 1n;
const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();
const base64 = getBase64Encoder();

const DISCRIMINATORS = {
  config: new Uint8Array([108, 178, 219, 20, 244, 156, 125, 109]),
  campaign: new Uint8Array([143, 234, 125, 14, 236, 236, 204, 213]),
  tranche: new Uint8Array([233, 144, 7, 123, 55, 248, 76, 50]),
  ledger: new Uint8Array([158, 156, 37, 108, 250, 90, 32, 182]),
  vote: new Uint8Array([203, 12, 118, 185, 180, 116, 242, 147]),
  claim: new Uint8Array([91, 3, 14, 101, 67, 160, 222, 63]),
} as const;

export type FundingStatusV2 = 'Draft' | 'Funding' | 'Succeeded' | 'Failed' | 'Completed' | 'Terminated';
export type TrancheStatusV2 = 'Pending' | 'Voting' | 'Revision' | 'Approved' | 'Rejected';

export type ProtocolConfigV2 = {
  address: Address;
  version: number;
  treasury: Address;
  feeBps: number;
  bump: number;
};

export type CampaignV2 = {
  address: Address;
  version: number;
  creator: Address;
  campaignId: bigint;
  goal: bigint;
  fundingDuration: number;
  fundingDeadline: number;
  termsHash: Uint8Array;
  termsUri: string;
  status: FundingStatusV2;
  trancheCount: number;
  sharesBps: number[];
  proofPeriods: number[];
  trancheAmounts: bigint[];
  raised: bigint;
  finalRaised: bigint;
  feePaid: bigint;
  netBudget: bigint;
  settledAt: number;
  firstProofDeadline: number;
  currentTranche: number;
  proofDeadline: number;
  reserved: bigint;
  refundPool: bigint;
  refundsPaid: bigint;
  bump: number;
};

export type TrancheV2 = {
  address: Address;
  campaign: Address;
  index: number;
  shareBps: number;
  proofPeriodSeconds: number;
  recipients: Address[];
  recipientSharesBps: number[];
  settled: boolean;
  status: TrancheStatusV2;
  round: number;
  evidenceHash: Uint8Array;
  evidenceUri: string;
  voteStart: number;
  voteEnd: number;
  revisionEnd: number;
  approveWeight: bigint;
  rejectWeight: bigint;
  claimCreated: boolean;
  bump: number;
};

export type BackerLedgerV2 = {
  address: Address;
  campaign: Address;
  backer: Address;
  amount: bigint;
  bump: number;
};

export type ClaimV2 = {
  address: Address;
  campaign: Address;
  tranche: Address;
  total: bigint;
  claimed: bigint;
  bump: number;
};

export type TermsRecipientV2 = { address: string; share_bps: number };
export type TermsTrancheV2 = {
  index: number;
  share_bps: number;
  proof_period_seconds: number;
  recipients: TermsRecipientV2[];
};
export type CampaignTermsV2 = {
  schema: 'bestcrow/campaign-terms/v2';
  asset: 'SOL';
  campaign_id: string;
  creator: string;
  goal_lamports: string;
  funding_duration_seconds: number;
  fee_bps: 100;
  vote_duration_seconds: 604800;
  revision_duration_seconds: 2592000;
  second_vote_duration_seconds: 604800;
  first_proof_deadline_seconds: 2592000;
  tranches: TermsTrancheV2[];
  refund_policy: 'remaining_unreserved_pro_rata_v2';
  content_uri: string;
};
export type CampaignContentV2 = { title: string; description: string; milestones?: Array<{ title: string; description?: string }>; [key: string]: unknown };

class Cursor {
  private offset = 8;
  private readonly data: Uint8Array;

  public constructor(data: Uint8Array) { this.data = data; }

  private take(length: number): Uint8Array {
    if (length < 0 || this.offset + length > this.data.length) throw new Error('Truncated V2 account data.');
    const value = this.data.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  public u8(): number { return this.take(1)[0]!; }
  public bool(): boolean {
    const value = this.u8();
    if (value > 1) throw new Error('Invalid boolean in V2 account.');
    return value === 1;
  }
  public u16(): number { return new DataView(this.take(2).buffer).getUint16(0, true); }
  public u32(): number { return new DataView(this.take(4).buffer).getUint32(0, true); }
  public u64(): bigint { return new DataView(this.take(8).buffer).getBigUint64(0, true); }
  public i64(): number {
    const value = new DataView(this.take(8).buffer).getBigInt64(0, true);
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('V2 timestamp is outside the safe range.');
    return number;
  }
  public address(): Address { return addressDecoder.decode(this.take(32)); }
  public fixed(length: number): Uint8Array { return this.take(length); }
  public string(maxLength = 200): string {
    const length = this.u32();
    if (length > maxLength) throw new Error('V2 URI exceeds the protocol limit.');
    return utf8Decoder.decode(this.take(length));
  }
}

function matches(data: Uint8Array, expected: Uint8Array): boolean {
  return expected.every((byte, index) => data[index] === byte);
}

function accountBytes(encoded: readonly [string, string]): Uint8Array {
  if (encoded[1] !== 'base64') throw new Error('Unexpected RPC account encoding.');
  return new Uint8Array(base64.encode(encoded[0]));
}

function requireAccount(data: Uint8Array, size: number, discriminator: Uint8Array, name: string): void {
  if (data.length !== size || !matches(data, discriminator)) throw new Error(`Invalid ${name} account.`);
}

function decodeConfig(accountAddress: Address, data: Uint8Array): ProtocolConfigV2 {
  requireAccount(data, PROTOCOL_CONFIG_V2_SIZE, DISCRIMINATORS.config, 'ProtocolConfigV2');
  const cursor = new Cursor(data);
  const config = { address: accountAddress, version: cursor.u8(), treasury: cursor.address(), feeBps: cursor.u16(), bump: cursor.u8() };
  if (config.version !== 2 || config.feeBps !== FEE_BPS_V2) throw new Error('Unsupported protocol configuration.');
  return config;
}

function decodeCampaign(accountAddress: Address, data: Uint8Array): CampaignV2 {
  requireAccount(data, CAMPAIGN_V2_SIZE, DISCRIMINATORS.campaign, 'CampaignV2');
  const cursor = new Cursor(data);
  const version = cursor.u8();
  const creator = cursor.address();
  const campaignId = cursor.u64();
  const goal = cursor.u64();
  const fundingDuration = cursor.i64();
  const fundingDeadline = cursor.i64();
  const termsHash = cursor.fixed(32);
  const termsUri = cursor.string();
  const statusIndex = cursor.u8();
  const trancheCount = cursor.u8();
  const sharesBps = Array.from({ length: MAX_TRANCHES_V2 }, () => cursor.u16());
  const proofPeriods = Array.from({ length: MAX_TRANCHES_V2 }, () => cursor.i64());
  const trancheAmounts = Array.from({ length: MAX_TRANCHES_V2 }, () => cursor.u64());
  const status = (['Draft', 'Funding', 'Succeeded', 'Failed', 'Completed', 'Terminated'] as const)[statusIndex];
  if (version !== 2 || !status || trancheCount > MAX_TRANCHES_V2) throw new Error('Unsupported CampaignV2 state.');
  return {
    address: accountAddress,
    version,
    creator,
    campaignId,
    goal,
    fundingDuration,
    fundingDeadline,
    termsHash,
    termsUri,
    status,
    trancheCount,
    sharesBps,
    proofPeriods,
    trancheAmounts,
    raised: cursor.u64(),
    finalRaised: cursor.u64(),
    feePaid: cursor.u64(),
    netBudget: cursor.u64(),
    settledAt: cursor.i64(),
    firstProofDeadline: cursor.i64(),
    currentTranche: cursor.u8(),
    proofDeadline: cursor.i64(),
    reserved: cursor.u64(),
    refundPool: cursor.u64(),
    refundsPaid: cursor.u64(),
    bump: cursor.u8(),
  };
}

export function decodeCampaignV2Account(accountAddress: Address, data: Uint8Array): CampaignV2 {
  return decodeCampaign(accountAddress, data);
}

function decodeTranche(accountAddress: Address, data: Uint8Array): TrancheV2 {
  requireAccount(data, TRANCHE_V2_SIZE, DISCRIMINATORS.tranche, 'TrancheV2');
  const cursor = new Cursor(data);
  const campaign = cursor.address();
  const index = cursor.u8();
  const shareBps = cursor.u16();
  const proofPeriodSeconds = cursor.i64();
  const recipientCount = cursor.u8();
  const allRecipients = Array.from({ length: MAX_RECIPIENTS_V2 }, () => cursor.address());
  const allRecipientShares = Array.from({ length: MAX_RECIPIENTS_V2 }, () => cursor.u16());
  const settled = cursor.bool();
  const statusIndex = cursor.u8();
  const status = (['Pending', 'Voting', 'Revision', 'Approved', 'Rejected'] as const)[statusIndex];
  if (!status || recipientCount === 0 || recipientCount > MAX_RECIPIENTS_V2) throw new Error('Unsupported TrancheV2 state.');
  return {
    address: accountAddress,
    campaign,
    index,
    shareBps,
    proofPeriodSeconds,
    recipients: allRecipients.slice(0, recipientCount),
    recipientSharesBps: allRecipientShares.slice(0, recipientCount),
    settled,
    status,
    round: cursor.u8(),
    evidenceHash: cursor.fixed(32),
    evidenceUri: cursor.string(),
    voteStart: cursor.i64(),
    voteEnd: cursor.i64(),
    revisionEnd: cursor.i64(),
    approveWeight: cursor.u64(),
    rejectWeight: cursor.u64(),
    claimCreated: cursor.bool(),
    bump: cursor.u8(),
  };
}

function decodeLedger(accountAddress: Address, data: Uint8Array): BackerLedgerV2 {
  requireAccount(data, BACKER_LEDGER_V2_SIZE, DISCRIMINATORS.ledger, 'BackerLedgerV2');
  const cursor = new Cursor(data);
  return { address: accountAddress, campaign: cursor.address(), backer: cursor.address(), amount: cursor.u64(), bump: cursor.u8() };
}

function decodeVoteRecord(accountAddress: Address, data: Uint8Array): {
  address: Address;
  campaign: Address;
  tranche: Address;
  backer: Address;
  round: number;
  approve: boolean;
  weight: bigint;
  bump: number;
} {
  requireAccount(data, VOTE_RECORD_V2_SIZE, DISCRIMINATORS.vote, 'VoteRecordV2');
  const cursor = new Cursor(data);
  return {
    address: accountAddress,
    campaign: cursor.address(),
    tranche: cursor.address(),
    backer: cursor.address(),
    round: cursor.u8(),
    approve: cursor.bool(),
    weight: cursor.u64(),
    bump: cursor.u8(),
  };
}

function decodeClaim(accountAddress: Address, data: Uint8Array): ClaimV2 {
  requireAccount(data, CLAIM_V2_SIZE, DISCRIMINATORS.claim, 'ClaimV2');
  const cursor = new Cursor(data);
  return { address: accountAddress, campaign: cursor.address(), tranche: cursor.address(), total: cursor.u64(), claimed: cursor.u64(), bump: cursor.u8() };
}

async function getOwnedAccount(client: AppClient, accountAddress: Address): Promise<Uint8Array | null> {
  const { value } = await withRpcRetry(
    () => client.rpc.getAccountInfo(accountAddress, { encoding: 'base64', commitment: 'confirmed' }).send(),
  );
  if (!value) return null;
  if (value.owner !== PROGRAM_ID_V2 || value.executable) throw new Error('Account is not owned by the configured Bestcrow program.');
  return accountBytes(value.data);
}

export async function protocolConfigV2Pda(): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['config-v2'] });
  return pda;
}
export async function campaignV2Pda(creator: Address, id: bigint): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['campaign-v2', addressEncoder.encode(creator), encodeU64(id)] });
  return pda;
}
export async function trancheV2Pda(campaign: Address, index: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['tranche-v2', addressEncoder.encode(campaign), encodeU8(index)] });
  return pda;
}
export async function backerLedgerV2Pda(campaign: Address, backer: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['backer-v2', addressEncoder.encode(campaign), addressEncoder.encode(backer)] });
  return pda;
}
export async function vaultV2Pda(campaign: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['vault-v2', addressEncoder.encode(campaign)] });
  return pda;
}
export async function voteRecordV2Pda(tranche: Address, round: number, backer: Address): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['vote-v2', addressEncoder.encode(tranche), encodeU8(round), addressEncoder.encode(backer)] });
  return pda;
}
export async function claimV2Pda(campaign: Address, index: number): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({ programAddress: PROGRAM_ID_V2, seeds: ['claim-v2', addressEncoder.encode(campaign), encodeU8(index)] });
  return pda;
}

export async function getProtocolConfigV2(client: AppClient): Promise<ProtocolConfigV2 | null> {
  const configAddress = await protocolConfigV2Pda();
  const data = await getOwnedAccount(client, configAddress);
  return data ? decodeConfig(configAddress, data) : null;
}
export async function getCampaignV2(client: AppClient, accountAddress: Address): Promise<CampaignV2 | null> {
  const data = await getOwnedAccount(client, accountAddress);
  if (!data) return null;
  const campaign = decodeCampaign(accountAddress, data);
  const expected = await campaignV2Pda(campaign.creator, campaign.campaignId);
  if (expected !== accountAddress) throw new Error('Campaign account does not match its PDA.');
  return campaign;
}
export async function getCampaignsV2(client: AppClient): Promise<CampaignV2[]> {
  const accounts = await withRpcRetry(() => client.rpc.getProgramAccounts(PROGRAM_ID_V2, {
    encoding: 'base64', commitment: 'confirmed', filters: [{ dataSize: BigInt(CAMPAIGN_V2_SIZE) }],
  }).send());
  const decoded = accounts.flatMap(({ pubkey, account }) => {
    if (account.owner !== PROGRAM_ID_V2 || account.executable) return [];
    try { return [decodeCampaign(pubkey, accountBytes(account.data))]; } catch { return []; }
  });
  const verified = await Promise.all(decoded.map(async (campaign) =>
    (await campaignV2Pda(campaign.creator, campaign.campaignId)) === campaign.address ? campaign : null,
  ));
  return verified.filter((campaign): campaign is CampaignV2 => campaign !== null)
    .sort((a, b) => b.fundingDeadline - a.fundingDeadline);
}
export async function getTrancheV2(client: AppClient, campaign: Address, index: number): Promise<TrancheV2 | null> {
  const trancheAddress = await trancheV2Pda(campaign, index);
  const data = await getOwnedAccount(client, trancheAddress);
  if (!data) return null;
  const tranche = decodeTranche(trancheAddress, data);
  if (tranche.campaign !== campaign || tranche.index !== index) throw new Error('Tranche account does not match its PDA.');
  return tranche;
}
export async function getTranchesV2(client: AppClient, campaign: CampaignV2): Promise<TrancheV2[]> {
  const values = await Promise.all(Array.from({ length: campaign.trancheCount }, (_, index) => getTrancheV2(client, campaign.address, index)));
  return values.filter((value): value is TrancheV2 => value !== null);
}
export async function getBackerLedgerV2(client: AppClient, campaign: Address, backer: Address): Promise<BackerLedgerV2 | null> {
  const ledgerAddress = await backerLedgerV2Pda(campaign, backer);
  const data = await getOwnedAccount(client, ledgerAddress);
  if (!data) return null;
  const ledger = decodeLedger(ledgerAddress, data);
  if (ledger.campaign !== campaign || ledger.backer !== backer) throw new Error('Backer ledger does not match its PDA.');
  return ledger;
}
export async function getBackerLedgersV2(client: AppClient, backer: Address): Promise<BackerLedgerV2[]> {
  const accounts = await withRpcRetry(() => client.rpc.getProgramAccounts(PROGRAM_ID_V2, {
    encoding: 'base64', commitment: 'confirmed', filters: [{ dataSize: BigInt(BACKER_LEDGER_V2_SIZE) }],
  }).send());
  const candidates = accounts.flatMap(({ pubkey, account }) => {
    if (account.owner !== PROGRAM_ID_V2 || account.executable) return [];
    try { return [decodeLedger(pubkey, accountBytes(account.data))]; } catch { return []; }
  });
  const verified = await Promise.all(candidates.map(async (ledger) => {
    if (ledger.backer !== backer) return null;
    const expected = await backerLedgerV2Pda(ledger.campaign, backer);
    return expected === ledger.address ? ledger : null;
  }));
  return verified.filter((ledger): ledger is BackerLedgerV2 => ledger !== null);
}
export async function getClaimV2(client: AppClient, campaign: Address, index: number): Promise<ClaimV2 | null> {
  const claimAddress = await claimV2Pda(campaign, index);
  const data = await getOwnedAccount(client, claimAddress);
  if (!data) return null;
  const claim = decodeClaim(claimAddress, data);
  const tranche = await trancheV2Pda(campaign, index);
  if (claim.campaign !== campaign || claim.tranche !== tranche) throw new Error('Claim account does not match its PDA.');
  return claim;
}
export async function hasVoteRecordV2(client: AppClient, tranche: TrancheV2, backer: Address): Promise<boolean> {
  const voteAddress = await voteRecordV2Pda(tranche.address, tranche.round, backer);
  const data = await getOwnedAccount(client, voteAddress);
  if (!data) return false;
  const vote = decodeVoteRecord(voteAddress, data);
  if (vote.campaign !== tranche.campaign || vote.tranche !== tranche.address || vote.backer !== backer || vote.round !== tranche.round) {
    throw new Error('Vote record does not match its PDA.');
  }
  return true;
}

type Meta = { address: Address; role: AccountRole };
const writable = (value: Address): Meta => ({ address: value, role: AccountRole.WRITABLE });
const signer = (value: Address): Meta => ({ address: value, role: AccountRole.WRITABLE_SIGNER });
const readonly = (value: Address): Meta => ({ address: value, role: AccountRole.READONLY });
const readonlySigner = (value: Address): Meta => ({ address: value, role: AccountRole.READONLY_SIGNER });

function encodeU8(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new Error('Value is outside the u8 range.');
  return new Uint8Array([value]);
}
function encodeU16(value: number): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > 65_535) throw new Error('Value is outside the u16 range.');
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}
function encodeU64(value: bigint): Uint8Array {
  if (value < 0n || value > MAX_U64) throw new Error('Value is outside the u64 range.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}
function encodeI64(value: number): Uint8Array {
  if (!Number.isSafeInteger(value)) throw new Error('Value is outside the safe i64 range.');
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigInt64(0, BigInt(value), true);
  return bytes;
}
function encodeBool(value: boolean): Uint8Array { return new Uint8Array([value ? 1 : 0]); }
function encodeString(value: string): Uint8Array {
  const body = utf8.encode(value);
  if (body.length > 200) throw new Error('URI exceeds the 200-byte protocol limit.');
  const bytes = new Uint8Array(4 + body.length);
  new DataView(bytes.buffer).setUint32(0, body.length, true);
  bytes.set(body, 4);
  return bytes;
}
function isValidProgramUri(value: string): boolean {
  const body = utf8.encode(value);
  return value.startsWith('ar://') && body.length > 5 && body.length <= 200;
}
function encodeVec(items: Uint8Array[]): Uint8Array {
  const bytes = new Uint8Array(4 + items.reduce((total, item) => total + item.length, 0));
  new DataView(bytes.buffer).setUint32(0, items.length, true);
  let offset = 4;
  for (const item of items) { bytes.set(item, offset); offset += item.length; }
  return bytes;
}

async function instruction(name: string, accounts: Meta[], args: Uint8Array[] = []): Promise<Instruction> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(`global:${name}`)));
  const parts = [hash.slice(0, 8), ...args];
  const data = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { data.set(part, offset); offset += part.length; }
  return { programAddress: PROGRAM_ID_V2, accounts, data };
}

export async function createCampaignDraftV2Ix(creator: Address, campaignId: bigint, goal: bigint, duration: number) {
  if (goal <= 0n || goal > MAX_U64) throw new Error('Campaign goal must be a positive u64.');
  if (!Number.isInteger(duration) || duration < DAY_SECONDS || duration > 183 * DAY_SECONDS) throw new Error('Funding duration must be 7–183 days.');
  const campaign = await campaignV2Pda(creator, campaignId);
  return {
    campaign,
    ix: await instruction('create_campaign_draft_v2', [
      signer(creator), readonly(await protocolConfigV2Pda()), writable(campaign), writable(await vaultV2Pda(campaign)), readonly(SYSTEM_PROGRAM),
    ], [encodeU64(campaignId), encodeU64(goal), encodeI64(duration)]),
  };
}
export async function addTrancheV2Ix(
  creator: Address,
  campaign: Address,
  index: number,
  shareBps: number,
  proofPeriod: number,
  recipients: Address[],
  shares: number[],
): Promise<Instruction> {
  if (!Number.isInteger(index) || index < 0 || index >= MAX_TRANCHES_V2) throw new Error('Tranche index is outside the supported range.');
  if (!Number.isInteger(shareBps) || shareBps < 1 || shareBps > 5_000) throw new Error('Tranche share must be 1–5000 bps.');
  if (!Number.isInteger(proofPeriod) || proofPeriod < DAY_SECONDS || proofPeriod > 183 * DAY_SECONDS) throw new Error('Proof period must be 7–183 days.');
  if (recipients.length === 0 || recipients.length > MAX_RECIPIENTS_V2 || recipients.length !== shares.length) throw new Error('Each tranche needs 1–5 recipients and matching shares.');
  if (new Set(recipients).size !== recipients.length || shares.some((share) => !Number.isInteger(share) || share <= 0 || share > 10_000) || shares.reduce((sum, share) => sum + share, 0) !== BPS_DENOMINATOR) {
    throw new Error('Recipient shares must be unique, positive, and sum to 10000 bps.');
  }
  return instruction('add_tranche_v2', [signer(creator), writable(campaign), writable(await trancheV2Pda(campaign, index)), readonly(SYSTEM_PROGRAM)], [
    encodeU8(index), encodeU16(shareBps), encodeI64(proofPeriod),
    encodeVec(recipients.map((value) => new Uint8Array(addressEncoder.encode(value)))),
    encodeVec(shares.map(encodeU16)),
  ]);
}
export async function sealTermsV2Ix(creator: Address, campaign: Address, hash: Uint8Array, uri: string): Promise<Instruction> {
  if (hash.length !== 32 || hash.every((byte) => byte === 0) || !isValidProgramUri(uri)) throw new Error('Sealing requires a non-zero 32-byte hash and an ar:// URI of at most 200 bytes.');
  return instruction('seal_terms_v2', [readonlySigner(creator), writable(campaign)], [hash, encodeString(uri)]);
}
export async function pledgeV2Ix(backer: Address, campaign: Address, amount: bigint): Promise<Instruction> {
  if (amount <= 0n || amount > MAX_U64) throw new Error('Pledge amount must be a positive u64.');
  return instruction('pledge_v2', [signer(backer), writable(campaign), writable(await backerLedgerV2Pda(campaign, backer)), writable(await vaultV2Pda(campaign)), readonly(SYSTEM_PROGRAM)], [encodeU64(amount)]);
}
export async function cancelPledgeV2Ix(backer: Address, campaign: Address): Promise<Instruction> {
  return instruction('cancel_pledge_v2', [signer(backer), writable(campaign), writable(await backerLedgerV2Pda(campaign, backer)), writable(await vaultV2Pda(campaign))]);
}
export async function finalizeFundingV2Ix(caller: Address, campaign: Address, treasury: Address): Promise<Instruction> {
  return instruction('finalize_funding_v2', [readonlySigner(caller), readonly(await protocolConfigV2Pda()), writable(campaign), writable(await vaultV2Pda(campaign)), writable(treasury)]);
}
export async function claimRefundV2Ix(caller: Address, campaign: Address, backer: Address): Promise<Instruction> {
  return instruction('claim_refund_v2', [readonlySigner(caller), readonly(campaign), writable(backer), writable(await backerLedgerV2Pda(campaign, backer)), writable(await vaultV2Pda(campaign))]);
}
export async function submitEvidenceV2Ix(creator: Address, campaign: Address, index: number, hash: Uint8Array, uri: string): Promise<Instruction> {
  if (!Number.isInteger(index) || index <= 0 || index >= MAX_TRANCHES_V2 || hash.length !== 32 || hash.every((byte) => byte === 0) || !isValidProgramUri(uri)) throw new Error('Evidence requires an index, non-zero 32-byte hash, and an ar:// URI of at most 200 bytes.');
  return instruction('submit_evidence_v2', [readonlySigner(creator), readonly(campaign), writable(await trancheV2Pda(campaign, index))], [encodeU8(index), hash, encodeString(uri)]);
}
export async function voteMilestoneV2Ix(backer: Address, campaign: Address, tranche: TrancheV2, approve: boolean): Promise<Instruction> {
  return instruction('vote_milestone_v2', [
    signer(backer), readonly(campaign), writable(tranche.address), readonly(await backerLedgerV2Pda(campaign, backer)),
    writable(await voteRecordV2Pda(tranche.address, tranche.round, backer)), readonly(SYSTEM_PROGRAM),
  ], [encodeU8(tranche.index), encodeBool(approve)]);
}
export async function finalizeVoteV2Ix(caller: Address, campaign: Address, index: number): Promise<Instruction> {
  return instruction('finalize_vote_v2', [readonlySigner(caller), writable(campaign), writable(await trancheV2Pda(campaign, index))], [encodeU8(index)]);
}
export async function finalizeProofTimeoutV2Ix(caller: Address, campaign: Address, index: number): Promise<Instruction> {
  return instruction('finalize_proof_timeout_v2', [readonlySigner(caller), writable(campaign), writable(await trancheV2Pda(campaign, index))], [encodeU8(index)]);
}
export async function releaseTrancheV2Ix(caller: Address, campaign: Address, index: number): Promise<Instruction> {
  return instruction('release_tranche_v2', [signer(caller), readonly(campaign), writable(await trancheV2Pda(campaign, index)), writable(await claimV2Pda(campaign, index)), readonly(SYSTEM_PROGRAM)], [encodeU8(index)]);
}
export async function withdrawClaimV2Ix(caller: Address, campaign: Address, tranche: TrancheV2): Promise<Instruction> {
  return instruction('withdraw_claim_v2', [
    readonlySigner(caller), writable(campaign), writable(tranche.address), writable(await claimV2Pda(campaign, tranche.index)), writable(await vaultV2Pda(campaign)),
    ...tranche.recipients.map(writable),
  ], [encodeU8(tranche.index)]);
}
export async function terminateV2Ix(caller: Address, campaign: Address, index: number): Promise<Instruction> {
  return instruction('terminate_v2', [readonlySigner(caller), writable(campaign), readonly(await trancheV2Pda(campaign, index)), writable(await vaultV2Pda(campaign))], [encodeU8(index)]);
}
export async function returnFundsV2Ix(creator: Address, campaign: Address, amount: bigint): Promise<Instruction> {
  if (amount <= 0n || amount > MAX_U64) throw new Error('Returned funding must be a positive u64.');
  return instruction('return_funds_v2', [signer(creator), readonly(campaign), writable(await vaultV2Pda(campaign)), readonly(SYSTEM_PROGRAM)], [encodeU64(amount)]);
}
export async function claimTerminationRefundV2Ix(caller: Address, campaign: Address, backer: Address): Promise<Instruction> {
  return instruction('claim_termination_refund_v2', [readonlySigner(caller), writable(campaign), writable(backer), writable(await backerLedgerV2Pda(campaign, backer)), writable(await vaultV2Pda(campaign))]);
}
export async function closeBackerLedgerV2Ix(caller: Address, campaign: Address, backer: Address): Promise<Instruction> {
  return instruction('close_backer_ledger_v2', [readonlySigner(caller), readonly(campaign), writable(backer), writable(await backerLedgerV2Pda(campaign, backer))]);
}

function canonicalValue(value: unknown): string {
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Canonical JSON numbers must be finite.');
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalValue(child)}`)
      .join(',')}}`;
  }
  throw new Error('Canonical JSON contains an unsupported value.');
}

export function canonicalizeJson(value: unknown): string { return canonicalValue(value); }
export function canonicalizeTermsV2(terms: CampaignTermsV2): string { return canonicalizeJson(terms); }
export async function hashCanonicalTermsV2(terms: CampaignTermsV2): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(canonicalizeTermsV2(terms))));
}
export function hashesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
export const MOCK_CONTENT_URI = 'ar://mock_content_000000000000000000000000000000';
export const MOCK_TERMS_URI = 'ar://mock_terms_00000000000000000000000000000000';

export function isMockArweaveUri(uri: string): boolean {
  if (typeof uri !== 'string') return false;
  return (
    uri.startsWith('ar://mock') ||
    uri === 'ar://0000000000000000000000000000000000000000000' ||
    uri === 'ar://AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
  );
}

const MOCK_STORAGE_PREFIX = 'bestcrow:mock-arweave:';

export function getMockArweave(uri: string): string | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    return localStorage.getItem(MOCK_STORAGE_PREFIX + uri);
  } catch {
    return null;
  }
}

export function saveMockArweave(uri: string, content: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem(MOCK_STORAGE_PREFIX + uri, content);
  } catch {
    // Storage is an optional aid.
  }
}

export function arweaveGatewayUrl(uri: string): string {
  if (!/^ar:\/\/[A-Za-z0-9_-]{43}$/.test(uri)) throw new Error('Enter a valid permanent ar:// transaction URI.');
  return `https://arweave.net/${uri.slice(5)}`;
}
export function validateTermsAgainstCampaignV2(campaign: CampaignV2, terms: CampaignTermsV2, tranches?: TrancheV2[]): void {
  const expectedKeys = ['asset', 'campaign_id', 'content_uri', 'creator', 'fee_bps', 'first_proof_deadline_seconds', 'funding_duration_seconds', 'goal_lamports', 'refund_policy', 'revision_duration_seconds', 'schema', 'second_vote_duration_seconds', 'tranches', 'vote_duration_seconds'];
  if (Object.keys(terms).sort().join(',') !== expectedKeys.join(',')) throw new Error('Terms document has missing or unsupported top-level fields.');
  if (terms.schema !== 'bestcrow/campaign-terms/v2' || terms.asset !== 'SOL' || terms.campaign_id !== campaign.campaignId.toString() ||
    terms.creator !== campaign.creator || terms.goal_lamports !== campaign.goal.toString() ||
    terms.funding_duration_seconds !== campaign.fundingDuration || terms.fee_bps !== FEE_BPS_V2 ||
    terms.vote_duration_seconds !== 604_800 || terms.revision_duration_seconds !== 2_592_000 ||
    terms.second_vote_duration_seconds !== 604_800 || terms.first_proof_deadline_seconds !== 2_592_000 ||
    terms.refund_policy !== 'remaining_unreserved_pro_rata_v2' || terms.tranches.length !== campaign.trancheCount) {
    throw new Error('Terms document financial fields do not match CampaignV2.');
  }
  arweaveGatewayUrl(terms.content_uri);
  for (let index = 0; index < terms.tranches.length; index += 1) {
    const term = terms.tranches[index]!;
    if (Object.keys(term).sort().join(',') !== 'index,proof_period_seconds,recipients,share_bps' || term.recipients.some((recipient) => Object.keys(recipient).sort().join(',') !== 'address,share_bps')) {
      throw new Error(`Terms milestone ${index + 1} has missing or unsupported fields.`);
    }
    if (term.index !== index || term.share_bps !== campaign.sharesBps[index] || term.proof_period_seconds !== campaign.proofPeriods[index]) {
      throw new Error(`Terms milestone ${index + 1} does not match CampaignV2.`);
    }
    const tranche = tranches?.[index];
    if (tranche && (term.recipients.length !== tranche.recipients.length ||
      term.recipients.some((recipient, recipientIndex) => recipient.address !== tranche.recipients[recipientIndex] || recipient.share_bps !== tranche.recipientSharesBps[recipientIndex]))) {
      throw new Error(`Terms recipient split ${index + 1} does not match TrancheV2.`);
    }
  }
}
export async function fetchVerifiedTermsV2(campaign: CampaignV2): Promise<{ terms: CampaignTermsV2; canonical: string }> {
  let text = getMockArweave(campaign.termsUri);
  if (!text) {
    const response = await fetch(arweaveGatewayUrl(campaign.termsUri), { cache: 'no-store' });
    if (!response.ok) throw new Error(`Permanent terms could not be loaded (${response.status}).`);
    text = await response.text();
  }
  if (text.length > 256_000) throw new Error('Terms document is unexpectedly large.');
  const terms = JSON.parse(text) as CampaignTermsV2;
  const canonical = canonicalizeTermsV2(terms);
  const actual = new Uint8Array(await crypto.subtle.digest('SHA-256', utf8.encode(canonical)));
  if (!hashesEqual(actual, campaign.termsHash)) throw new Error('Terms hash does not match the on-chain commitment.');
  validateTermsAgainstCampaignV2(campaign, terms);
  return { terms, canonical };
}
export async function fetchCampaignContentV2(terms: CampaignTermsV2): Promise<CampaignContentV2> {
  const local = getMockArweave(terms.content_uri);
  if (local) {
    try {
      const parsed = JSON.parse(local) as CampaignContentV2;
      if (typeof parsed.title === 'string' && typeof parsed.description === 'string') {
        return parsed;
      }
    } catch { /* proceed to network fetch */ }
  }

  let text: string | null = null;
  try {
    const response = await fetch(arweaveGatewayUrl(terms.content_uri), { cache: 'no-store' });
    if (!response.ok) {
      if (isMockArweaveUri(terms.content_uri)) {
        return {
          title: `Campaign ${terms.campaign_id}`,
          description: 'Verified on-chain startup campaign created in mock/dev mode.',
          milestones: terms.tranches.map((t) => ({ title: `Milestone ${t.index + 1}` })),
        };
      }
      throw new Error(`Permanent campaign content could not be loaded (${response.status}).`);
    }
    text = await response.text();
  } catch (err) {
    if (isMockArweaveUri(terms.content_uri)) {
      return {
        title: `Campaign ${terms.campaign_id}`,
        description: 'Verified on-chain startup campaign created in mock/dev mode.',
        milestones: terms.tranches.map((t) => ({ title: `Milestone ${t.index + 1}` })),
      };
    }
    throw err;
  }

  if (text.length > 256_000) throw new Error('Campaign content is unexpectedly large.');
  const content = JSON.parse(text) as CampaignContentV2;
  if (typeof content.title !== 'string' || content.title.trim().length < 3 || typeof content.description !== 'string' || content.description.trim().length < 20) {
    throw new Error('Campaign content is missing a valid title or description.');
  }
  if (content.milestones !== undefined && (!Array.isArray(content.milestones) || content.milestones.some((item) => typeof item?.title !== 'string' || item.title.trim().length === 0))) {
    throw new Error('Campaign content has invalid milestone labels.');
  }
  return content;
}

export function formatSolV2(lamports: bigint): string {
  const whole = lamports / 1_000_000_000n;
  const decimal = (lamports % 1_000_000_000n).toString().padStart(9, '0').replace(/0+$/, '');
  return decimal ? `${whole}.${decimal}` : whole.toString();
}
export function parseSolV2(value: string): bigint {
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,9})?$/.test(value)) throw new Error('Enter a positive SOL amount with at most 9 decimal places.');
  const [whole, fraction = ''] = value.split('.');
  const lamports = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
  if (lamports <= 0n || lamports > MAX_U64) throw new Error('SOL amount is outside the supported range.');
  return lamports;
}
export function explorerTransactionUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
