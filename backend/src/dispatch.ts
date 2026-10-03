import { readFileSync } from "node:fs";
import { Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import type { BackendConfig } from "./config.js";
import type { SolanaGateway } from "./chain.js";
import { InstructionCodec } from "./instructions.js";
import { KeeperService, type Action } from "./keeper.js";

export class KeeperDispatcher {
  private running = false;

  private constructor(
    private readonly keeper: Keypair,
    private readonly chain: SolanaGateway,
    private readonly service: KeeperService,
  ) {}

  static fromConfig(config: BackendConfig, chain: SolanaGateway, service: KeeperService): KeeperDispatcher | null {
    if (!config.keeperAutosend) return null;
    const path = config.keeperKeypairPath;
    if (!path) throw new Error("KEEPER_KEYPAIR_PATH is required when KEEPER_AUTOSEND=1");
    const secret = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(secret) || secret.length !== 64) throw new Error("Keeper keypair file is invalid");
    return new KeeperDispatcher(Keypair.fromSecretKey(Uint8Array.from(secret)), chain, service);
  }

  async dispatch(actions: Action[]): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const action of actions) {
        try {
          const record = await this.chain.getCampaign(action.campaign);
          if (!record) continue;
          const fresh = await this.service.campaignAction(record);
          if (!fresh || fresh.kind !== action.kind) continue;
          const unsigned = await this.service.unsignedAction(record, fresh, this.keeper.publicKey.toBase58());
          const transaction = new Transaction();
          for (const item of unsigned.instructions) transaction.add(InstructionCodec.toWeb3(item));
          const signature = await sendAndConfirmTransaction(this.chain.connection, transaction, [this.keeper], { commitment: "confirmed" });
          console.log("Keeper transaction confirmed", fresh.kind, fresh.campaign, signature);
        } catch (error) {
          console.error("Keeper dispatch failed", action.kind, action.campaign, error);
        }
      }
    } finally {
      this.running = false;
    }
  }
}
