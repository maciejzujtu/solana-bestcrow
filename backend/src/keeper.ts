import {
  CampaignStatus,
  MilestoneStatus,
  getClaimRefundInstruction,
  getExpireMilestoneInstruction,
  getFinalizeFundingInstruction,
  getResolveMilestoneInstruction,
  type Campaign,
} from "@bestcrow/client";
import { address } from "@solana/kit";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import type { BackendConfig } from "./config.js";
import { SolanaGateway, type CampaignRecord } from "./chain.js";
import { InstructionCodec } from "./instructions.js";

export type ActionKind = "finalize_funding" | "expire_milestone" | "resolve_milestone";
export type Action = { kind: ActionKind; campaign: string; reason: string };

/** The contract repeats every eligibility check before moving USDC. */
export function decideAction(record: CampaignRecord, now: number): Action | null {
  const campaign = record.account;
  if (campaign.status === CampaignStatus.Funding && now >= Number(campaign.fundingDeadline) && campaign.totalRaised < campaign.goal) {
    return { kind: "finalize_funding", campaign: record.address, reason: "Funding ended below goal" };
  }
  if (campaign.status !== CampaignStatus.Active) return null;
  const milestone = campaign.milestones[campaign.currentMilestone];
  if (!milestone) return null;
  if (milestone.status === MilestoneStatus.Pending && now > Number(milestone.dueAt)) {
    return { kind: "expire_milestone", campaign: record.address, reason: "Evidence deadline passed" };
  }
  if (milestone.status === MilestoneStatus.Reviewing && now >= Number(milestone.voteDeadline)) {
    return { kind: "resolve_milestone", campaign: record.address, reason: "Backer voting period ended" };
  }
  return null;
}

export class KeeperService {
  constructor(private readonly config: BackendConfig, private readonly chain: SolanaGateway) {}

  async campaignAction(record: CampaignRecord, now = Math.floor(Date.now() / 1000)): Promise<Action | null> {
    return decideAction(record, now);
  }

  async refundInstruction(record: CampaignRecord, walletAddress: string, callerAddress: string) {
    const campaign = record.account;
    if (campaign.status !== CampaignStatus.Failed && campaign.status !== CampaignStatus.Terminated) {
      throw new Error("Refund is unavailable");
    }
    const wallet = this.chain.publicKey(walletAddress);
    const receipt = await this.chain.getBacker(record.address, walletAddress);
    if (!receipt) throw new Error("Backer receipt is missing");
    const backer = receipt.account;
    if (String(backer.wallet) !== walletAddress || String(backer.campaign) !== record.address || backer.claimed || backer.amount === 0n) {
      throw new Error("Refund is unavailable");
    }
    const amount = backer.amount * campaign.refundPool / campaign.refundDenominator;
    const walletToken = getAssociatedTokenAddressSync(this.chain.publicKey(String(campaign.quoteMint)), wallet);
    const instruction = getClaimRefundInstruction({
      caller: InstructionCodec.readonlySigner(callerAddress),
      campaign: address(record.address),
      wallet: address(walletAddress),
      backer: address(receipt.address),
      quoteMint: campaign.quoteMint,
      vault: campaign.vault,
      walletToken: address(walletToken.toBase58()),
    }, { programAddress: address(this.config.stagegateProgramId) });
    return { amount: amount.toString(), mint: campaign.quoteMint, instruction: InstructionCodec.fromKit(instruction) };
  }

  async unsignedAction(record: CampaignRecord, action: Action, caller: string) {
    const campaign: Campaign = record.account;
    const signer = InstructionCodec.readonlySigner(caller);
    const campaignKey = address(record.address);
    const programAddress = address(this.config.stagegateProgramId);
    if (action.kind === "finalize_funding") {
      const ix = getFinalizeFundingInstruction({ caller: signer, campaign: campaignKey }, { programAddress });
      return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
    }
    if (action.kind === "expire_milestone") {
      const ix = getExpireMilestoneInstruction({ caller: signer, campaign: campaignKey }, { programAddress });
      return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
    }
    const creatorToken = getAssociatedTokenAddressSync(
      this.chain.publicKey(String(campaign.quoteMint)),
      this.chain.publicKey(String(campaign.creator)),
    );
    const ix = getResolveMilestoneInstruction({
      caller: signer,
      campaign: campaignKey,
      quoteMint: campaign.quoteMint,
      vault: campaign.vault,
      creator: campaign.creator,
      creatorToken: address(creatorToken.toBase58()),
    }, { programAddress });
    return { ...action, instructions: [InstructionCodec.fromKit(ix)] };
  }

  async scanActions(): Promise<Action[]> {
    const campaigns = await this.chain.listCampaigns();
    return campaigns.map((campaign) => decideAction(campaign, Math.floor(Date.now() / 1000))).filter((action): action is Action => action !== null);
  }
}
