import { PublicKey } from "@solana/web3.js";

// Must match rust/programs/bestcrow/src/lib.rs::declare_id! and the generated IDL.
const DEFAULT_STAGEGATE_PROGRAM_ID = "EousWVK2cePYb9zvv1oWSca4VNdRQqYef8CsxQ6BL57R";
const DEFAULT_USDC_MINTS = [
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
];

function integerSetting(name: string, value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return result;
}

function publicKeySetting(name: string, value: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new Error(`${name} must be a valid Solana public key`);
  }
}

function booleanSetting(name: string, value: string | undefined): boolean {
  if (value === undefined || value === "0" || value === "false") return false;
  if (value === "1" || value === "true") return true;
  throw new Error(`${name} must be 0, 1, false, or true`);
}

export class BackendConfig {
  private constructor(
    readonly rpcUrl: string,
    readonly host: string,
    readonly port: number,
    readonly pollMs: number,
    readonly maxBodyBytes: number,
    readonly stagegateProgramId: string,
    readonly usdcMints: readonly string[],
    readonly keeperAutosend: boolean,
    readonly keeperKeypairPath: string | undefined,
  ) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): BackendConfig {
    const rpcUrl = env.RPC_URL ?? "https://api.devnet.solana.com";
    try {
      const url = new URL(rpcUrl);
      if (!(["http:", "https:"].includes(url.protocol))) throw new Error();
    } catch {
      throw new Error("RPC_URL must be an http or https URL");
    }
    const usdcMints = (env.USDC_MINTS ?? DEFAULT_USDC_MINTS.join(","))
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => publicKeySetting("USDC_MINTS", value));
    if (usdcMints.length === 0 || new Set(usdcMints).size !== usdcMints.length) {
      throw new Error("USDC_MINTS must contain distinct Solana mint addresses");
    }
    const keeperAutosend = booleanSetting("KEEPER_AUTOSEND", env.KEEPER_AUTOSEND);
    const keeperKeypairPath = env.KEEPER_KEYPAIR_PATH || undefined;
    if (keeperAutosend && !keeperKeypairPath) {
      throw new Error("KEEPER_KEYPAIR_PATH is required when KEEPER_AUTOSEND=1");
    }
    const pollMs = integerSetting("POLL_MS", env.POLL_MS, 0, 0, 86_400_000);
    if (keeperAutosend && pollMs === 0) {
      throw new Error("POLL_MS must be positive when KEEPER_AUTOSEND=1");
    }
    return new BackendConfig(
      rpcUrl,
      env.HOST || "0.0.0.0",
      integerSetting("PORT", env.PORT, 3001, 1, 65535),
      pollMs,
      integerSetting("MAX_BODY_BYTES", env.MAX_BODY_BYTES, 16_384, 1024, 1_048_576),
      publicKeySetting("STAGEGATE_PROGRAM_ID", env.STAGEGATE_PROGRAM_ID ?? DEFAULT_STAGEGATE_PROGRAM_ID),
      usdcMints,
      keeperAutosend,
      keeperKeypairPath,
    );
  }

  acceptsUsdcMint(mint: string): boolean {
    return this.usdcMints.includes(mint);
  }
}
