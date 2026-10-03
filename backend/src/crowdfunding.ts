import {
  CampaignStatus, MilestoneStatus,
  getCastVoteInstruction, getCreateCampaignInstruction, getPledgeInstruction,
  getSubmitEvidenceInstruction, getWithdrawPledgeInstruction,
} from "@bestcrow/client";
import { address } from "@solana/kit";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import type { CampaignRecord } from "./chain.js";
import { SolanaGateway } from "./chain.js";
import type { BackendConfig } from "./config.js";
import { InstructionCodec } from "./instructions.js";

const U64_MAX = (1n << 64n) - 1n;
const MIN_VOTE_SECONDS = 60;
const MAX_VOTE_SECONDS = 30 * 24 * 60 * 60;

export type CreateRequest = {
  creator: string;
  campaignId: string;
  quoteMint: string;
  goal: string;
  initialRelease: string;
  fundingDeadline: number;
  voteDurationSecs: number;
  metadataHash: string;
  milestones: Array<{ amount: string; dueAt: number }>;
};

export function usdcUnits(value: string, allowZero = false): bigint {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,6})?$/.test(value)) {
    throw new Error("USDC amount must have at most six decimal places");
  }
  const [whole, fraction = ""] = value.split(".");
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0") || "0");
  if (amount > U64_MAX || (!allowZero && amount === 0n)) throw new Error("USDC amount is outside the allowed range");
  return amount;
}

function timestamp(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(name + " must be a positive Unix timestamp");
  return value;
}

function hash32(value: string): number[] {
  if (typeof value !== "string" || !/^[0-9a-fA-F]{64}$/.test(value) || /^0{64}$/.test(value)) {
    throw new Error("metadata/evidence hash must be 32 nonzero bytes in hex");
  }
  return Array.from(Buffer.from(value, "hex"));
}

export class CrowdfundingService {
  constructor(private readonly config: BackendConfig, private readonly chain: SolanaGateway) {}

  private program() { return { programAddress: address(this.config.stagegateProgramId) }; }

  private pda(seeds: Buffer[]): PublicKey {
    return PublicKey.findProgramAddressSync(seeds, this.chain.programId)[0];
  }

  private backer(campaign: string, wallet: string): PublicKey {
    return this.pda([Buffer.from("backer"), this.chain.publicKey(campaign).toBuffer(), this.chain.publicKey(wallet).toBuffer()]);
  }

  prepareCreate(input: CreateRequest) {
    const creator = this.chain.publicKey(input.creator);
    const quoteMint = this.chain.publicKey(input.quoteMint);
    if (!this.config.acceptsUsdcMint(quoteMint.toBase58())) throw new Error("Unsupported USDC mint");
    if (typeof input.campaignId !== "string" || !/^\d+$/.test(input.campaignId)) throw new Error("Invalid campaign ID");
    const campaignId = BigInt(input.campaignId);
    if (campaignId > U64_MAX) throw new Error("Invalid campaign ID");
    const goal = usdcUnits(input.goal);
    const initialRelease = usdcUnits(input.initialRelease, true);
    const fundingDeadline = timestamp(input.fundingDeadline, "Funding deadline");
    if (fundingDeadline <= Math.floor(Date.now() / 1000)) throw new Error("Funding deadline must be in the future");
    if (!Number.isSafeInteger(input.voteDurationSecs) || input.voteDurationSecs < MIN_VOTE_SECONDS || input.voteDurationSecs > MAX_VOTE_SECONDS) {
      throw new Error("Voting duration must be between 60 seconds and 30 days");
    }
    if (!Array.isArray(input.milestones) || input.milestones.length < 5 || input.milestones.length > 10) {
      throw new Error("Campaign requires five to ten milestones");
    }
    if (initialRelease * 10_000n > goal * 3_000n) throw new Error("Kickoff release exceeds 30% of goal");
    let total = initialRelease;
    let previousDue = fundingDeadline;
    const milestones = input.milestones.map((item) => {
      const amount = usdcUnits(item.amount);
      const dueAt = timestamp(item.dueAt, "Milestone due date");
      if (amount * 10_000n > goal * 5_000n) throw new Error("Milestone exceeds 50% of goal");
      if (dueAt <= previousDue + input.voteDurationSecs) throw new Error("Milestone due dates must leave a full voting period");
      previousDue = dueAt;
      total += amount;
      return { amount, dueAt: BigInt(dueAt) };
    });
    if (total !== goal) throw new Error("Kickoff and milestone amounts must sum to the goal");
    const metadataHash = hash32(input.metadataHash);
    const campaignIdBytes = Buffer.alloc(8);
    campaignIdBytes.writeBigUInt64LE(campaignId);
    const campaign = this.pda([Buffer.from("campaign"), creator.toBuffer(), campaignIdBytes]);
    const vault = this.pda([Buffer.from("vault"), campaign.toBuffer()]);
    const creatorToken = getAssociatedTokenAddressSync(quoteMint, creator);
    const ix = getCreateCampaignInstruction({
      creator: InstructionCodec.readonlySigner(creator.toBase58()),
      campaign: address(campaign.toBase58()),
      quoteMint: address(quoteMint.toBase58()),
      vault: address(vault.toBase58()),
      creatorToken: address(creatorToken.toBase58()),
      args: {
        campaignId, goal, initialRelease,
        fundingDeadline: BigInt(fundingDeadline),
        voteDurationSecs: BigInt(input.voteDurationSecs),
        metadataHash, milestones,
      },
    }, this.program());
    return { campaign: campaign.toBase58(), instructions: [InstructionCodec.fromKit(ix)] };
  }

  preparePledge(record: CampaignRecord, walletAddress: string, amountText: string) {
    const campaign = record.account;
    if (campaign.status !== CampaignStatus.Funding) throw new Error("Campaign is not open for funding");
    const amount = usdcUnits(amountText);
    if (campaign.totalRaised + amount > campaign.goal) throw new Error("Pledge would exceed the goal");
    const wallet = this.chain.publicKey(walletAddress);
    const quoteMint = this.chain.publicKey(String(campaign.quoteMint));
    const creator = this.chain.publicKey(String(campaign.creator));
    const ix = getPledgeInstruction({
      wallet: InstructionCodec.readonlySigner(walletAddress),
      campaign: address(record.address),
      backer: address(this.backer(record.address, walletAddress).toBase58()),
      quoteMint: campaign.quoteMint,
      vault: campaign.vault,
      walletToken: address(getAssociatedTokenAddressSync(quoteMint, wallet).toBase58()),
      creator: campaign.creator,
      creatorToken: address(getAssociatedTokenAddressSync(quoteMint, creator).toBase58()),
      amount,
    }, this.program());
    return { campaign: record.address, amount: amount.toString(), instructions: [InstructionCodec.fromKit(ix)] };
  }

  prepareWithdraw(record: CampaignRecord, walletAddress: string, amountText: string) {
    const campaign = record.account;
    if (campaign.status !== CampaignStatus.Funding) throw new Error("Campaign is not open for withdrawals");
    const amount = usdcUnits(amountText);
    const wallet = this.chain.publicKey(walletAddress);
    const quoteMint = this.chain.publicKey(String(campaign.quoteMint));
    const ix = getWithdrawPledgeInstruction({
      wallet: InstructionCodec.readonlySigner(walletAddress),
      campaign: address(record.address),
      backer: address(this.backer(record.address, walletAddress).toBase58()),
      quoteMint: campaign.quoteMint,
      vault: campaign.vault,
      walletToken: address(getAssociatedTokenAddressSync(quoteMint, wallet).toBase58()),
      amount,
    }, this.program());
    return { campaign: record.address, amount: amount.toString(), instructions: [InstructionCodec.fromKit(ix)] };
  }

  prepareEvidence(record: CampaignRecord, creatorAddress: string, evidenceHash: string) {
    const campaign = record.account;
    if (String(campaign.creator) !== creatorAddress || campaign.status !== CampaignStatus.Active) {
      throw new Error("Only the active campaign creator can submit evidence");
    }
    const milestone = campaign.milestones[campaign.currentMilestone];
    if (!milestone || milestone.status !== MilestoneStatus.Pending) throw new Error("Milestone is not pending");
    const ix = getSubmitEvidenceInstruction({
      creator: InstructionCodec.readonlySigner(creatorAddress),
      campaign: address(record.address),
      evidenceHash: hash32(evidenceHash),
    }, this.program());
    return { campaign: record.address, instructions: [InstructionCodec.fromKit(ix)] };
  }

  async prepareVote(record: CampaignRecord, walletAddress: string, approve: boolean) {
    const campaign = record.account;
    if (campaign.status !== CampaignStatus.Active) throw new Error("Campaign is not active");
    const milestone = campaign.milestones[campaign.currentMilestone];
    if (!milestone || milestone.status !== MilestoneStatus.Reviewing) throw new Error("Voting is not open");
    if (Math.floor(Date.now() / 1000) >= Number(milestone.voteDeadline)) throw new Error("Voting period has ended");
    const receipt = await this.chain.getBacker(record.address, walletAddress);
    if (!receipt || receipt.account.amount === 0n || receipt.account.claimed) throw new Error("Backer receipt is missing");
    const vote = this.pda([
      Buffer.from("vote"),
      this.chain.publicKey(record.address).toBuffer(),
      Buffer.from([campaign.currentMilestone]),
      this.chain.publicKey(walletAddress).toBuffer(),
    ]);
    const ix = getCastVoteInstruction({
      wallet: InstructionCodec.readonlySigner(walletAddress),
      campaign: address(record.address),
      backer: address(receipt.address),
      vote: address(vote.toBase58()),
      approve,
    }, this.program());
    return { campaign: record.address, vote: vote.toBase58(), instructions: [InstructionCodec.fromKit(ix)] };
  }
}
