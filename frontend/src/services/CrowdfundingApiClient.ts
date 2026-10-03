export type SerializedInstruction = {
  programId: string;
  accounts: Array<{ address: string; isSigner: boolean; isWritable: boolean }>;
  data: string;
};

export type PreparedCampaignTransaction = {
  campaign: string;
  instructions: SerializedInstruction[];
};

export type CampaignAccount = {
  creator: string;
  quoteMint: string;
  goal: string;
  totalRaised: string;
  escrowBalance: string;
  totalReleased: string;
  initialRelease: string;
  fundingDeadline: string;
  voteDurationSecs: string;
  currentMilestone: number;
  status: number;
  milestones: Array<{
    amount: string;
    dueAt: string;
    evidenceHash: number[];
    voteDeadline: string;
    yesVotes: string;
    noVotes: string;
    status: number;
  }>;
};

export type CampaignRecord = { address: string; account: CampaignAccount };

export class CrowdfundingApiClient {
  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch("/api/campaigns/" + path, { ...init, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "Campaign request failed");
    return body as T;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  create(input: unknown): Promise<PreparedCampaignTransaction> {
    return this.post("prepare", input);
  }

  campaign(address: string): Promise<CampaignRecord> {
    return this.request(address);
  }

  prepare(address: string, action: "pledge" | "withdraw" | "evidence" | "vote", input: unknown): Promise<PreparedCampaignTransaction> {
    return this.post(address + "/" + action + "/prepare", input);
  }

  action(address: string, caller: string): Promise<{ action?: null; instructions?: SerializedInstruction[] }> {
    return this.request(address + "/action?caller=" + encodeURIComponent(caller));
  }

  refund(address: string, wallet: string): Promise<{ instruction: SerializedInstruction }> {
    return this.request(address + "/refund?wallet=" + encodeURIComponent(wallet) + "&caller=" + encodeURIComponent(wallet));
  }
}
