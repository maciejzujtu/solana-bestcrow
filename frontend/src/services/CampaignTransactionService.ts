import { Buffer } from "buffer";
import { Connection, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { SerializedInstruction } from "./CrowdfundingApiClient";

export class CampaignTransactionService {
  private static readonly programId = process.env.NEXT_PUBLIC_BESTCROW_PROGRAM_ID
    || "EousWVK2cePYb9zvv1oWSca4VNdRQqYef8CsxQ6BL57R";

  constructor(
    private readonly connection: Connection,
    private readonly wallet: PublicKey,
    private readonly send: (transaction: Transaction, connection: Connection) => Promise<string>,
  ) {}

  async execute(instructions: SerializedInstruction[]): Promise<string> {
    if (instructions.length !== 1 || instructions[0].programId !== CampaignTransactionService.programId) {
      throw new Error("Unexpected Bestcrow instruction");
    }
    const ix = instructions[0];
    if (ix.accounts.length === 0 || ix.accounts.length > 16 ||
        ix.accounts.some((account) => account.isSigner && account.address !== this.wallet.toBase58())) {
      throw new Error("Unexpected signer or account list");
    }
    const transaction = new Transaction().add(new TransactionInstruction({
      programId: new PublicKey(ix.programId),
      keys: ix.accounts.map((account) => ({
        pubkey: new PublicKey(account.address),
        isSigner: account.isSigner,
        isWritable: account.isWritable,
      })),
      data: Buffer.from(ix.data, "base64"),
    }));
    const blockhash = await this.connection.getLatestBlockhash("confirmed");
    transaction.feePayer = this.wallet;
    transaction.recentBlockhash = blockhash.blockhash;
    const simulation = await this.connection.simulateTransaction(transaction);
    if (simulation.value.err) {
      throw new Error("Transaction simulation failed: " + JSON.stringify(simulation.value.err));
    }
    const signature = await this.send(transaction, this.connection);
    await this.connection.confirmTransaction({ signature, ...blockhash }, "confirmed");
    return signature;
  }
}
