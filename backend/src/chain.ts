import { getBackerDecoder, getCampaignDecoder, type Backer, type Campaign } from "@bestcrow/client";
import { Connection, PublicKey } from "@solana/web3.js";
import { BackendConfig } from "./config.js";

export type CampaignRecord = { address: string; account: Campaign };
export type BackerRecord = { address: string; account: Backer };
export class SolanaGateway {
  readonly connection: Connection;
  readonly programId: PublicKey;

  constructor(readonly config: BackendConfig, connection?: Connection) {
    this.connection = connection ?? new Connection(config.rpcUrl, "confirmed");
    this.programId = new PublicKey(config.stagegateProgramId);
  }

  publicKey(value: string): PublicKey {
    return new PublicKey(value);
  }

  async listCampaigns(): Promise<CampaignRecord[]> {
    const accounts = await this.connection.getProgramAccounts(this.programId, { commitment: "confirmed" });
    const decoder = getCampaignDecoder();
    const campaigns: CampaignRecord[] = [];
    for (const item of accounts) {
      try {
        campaigns.push({ address: item.pubkey.toBase58(), account: decoder.decode(item.account.data) });
      } catch {
        // The program also owns Backer and Vote accounts.
      }
    }
    return campaigns;
  }

  async getCampaign(address: string): Promise<CampaignRecord | null> {
    const key = this.publicKey(address);
    const info = await this.connection.getAccountInfo(key, "confirmed");
    if (!info) return null;
    if (!info.owner.equals(this.programId)) throw new Error("Account is not owned by Bestcrow v2");
    return { address, account: getCampaignDecoder().decode(info.data) };
  }

  async getBacker(campaignAddress: string, walletAddress: string): Promise<BackerRecord | null> {
    const campaign = this.publicKey(campaignAddress);
    const wallet = this.publicKey(walletAddress);
    const [key] = PublicKey.findProgramAddressSync(
      [Buffer.from("backer"), campaign.toBuffer(), wallet.toBuffer()],
      this.programId,
    );
    const info = await this.connection.getAccountInfo(key, "confirmed");
    if (!info) return null;
    if (!info.owner.equals(this.programId)) throw new Error("Backer receipt has the wrong owner");
    return { address: key.toBase58(), account: getBackerDecoder().decode(info.data) };
  }

}
