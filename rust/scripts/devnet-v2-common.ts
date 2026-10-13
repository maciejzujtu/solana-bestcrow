import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AnchorProvider,
  Program,
  Wallet,
  type Idl,
  web3,
} from '@anchor-lang/core';

const { Connection, Keypair, PublicKey } = web3;

export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const DEVNET_GENESIS_HASH_PREFIX = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1';
export const DEFAULT_DEVNET_RPC = 'https://api.devnet.solana.com';
export const BPF_UPGRADEABLE_LOADER = new PublicKey(
  'BPFLoaderUpgradeab1e11111111111111111111111',
);
export const CONFIG_SEED = Buffer.from('config-v2');

export type CliArgs = {
  flags: Set<string>;
  options: Map<string, string>;
};

export type DevnetContext = {
  connection: InstanceType<typeof Connection>;
  idl: Idl;
  program: Program;
  programId: InstanceType<typeof PublicKey>;
  provider: AnchorProvider;
  rpcUrl: string;
  wallet: Wallet;
  walletPath: string;
};

export function parseArgs(argv: string[]): CliArgs {
  const flags = new Set<string>();
  const options = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token?.startsWith('--')) throw new Error(`Unexpected argument: ${token ?? ''}`);
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      flags.add(token);
      continue;
    }
    options.set(token, next);
    index += 1;
  }
  return { flags, options };
}

export function option(
  args: CliArgs,
  name: string,
  environmentValue?: string,
  fallback?: string,
): string | undefined {
  return args.options.get(name) ?? environmentValue ?? fallback;
}

export function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith('~/')) return path.join(os.homedir(), input.slice(2));
  return path.resolve(input);
}

export function readWallet(walletPathInput: string): Wallet {
  const walletPath = expandHome(walletPathInput);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read deployer wallet at ${walletPath}: ${String(error)}`);
  }
  if (
    !Array.isArray(parsed)
    || parsed.length !== 64
    || parsed.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    throw new Error(`Wallet file must contain a 64-byte Solana keypair: ${walletPath}`);
  }
  return new Wallet(Keypair.fromSecretKey(Uint8Array.from(parsed as number[])));
}

export function readIdl(idlPathInput: string): Idl {
  const idlPath = path.resolve(idlPathInput);
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(idlPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read generated IDL at ${idlPath}: ${String(error)}`);
  }
  const idl = parsed as Idl;
  if (!idl.address || !Array.isArray(idl.instructions)) {
    throw new Error(`Invalid Anchor IDL: ${idlPath}`);
  }
  return idl;
}

export async function loadDevnetContext(args: CliArgs): Promise<DevnetContext> {
  const rpcUrl = option(args, '--rpc', process.env.ANCHOR_PROVIDER_URL, DEFAULT_DEVNET_RPC)!;
  const walletPath = expandHome(
    option(args, '--wallet', process.env.ANCHOR_WALLET, '~/.config/solana/id.json')!,
  );
  const idlPath = option(
    args,
    '--idl',
    process.env.ANCHOR_IDL,
    path.resolve('target/idl/charity_vault.json'),
  )!;
  const idl = readIdl(idlPath);
  const configuredProgramId = option(args, '--program-id', process.env.PROGRAM_ID, idl.address)!;
  const programId = new PublicKey(configuredProgramId);
  if (programId.toBase58() !== idl.address) {
    throw new Error(
      `Program ID ${programId.toBase58()} does not match generated IDL address ${idl.address}`,
    );
  }

  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH && !genesisHash.startsWith(DEVNET_GENESIS_HASH_PREFIX)) {
    throw new Error(`RPC is not Solana Devnet (unexpected genesis hash ${genesisHash})`);
  }

  const wallet = readWallet(walletPath);
  const provider = new AnchorProvider(connection, wallet, {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  });
  const program = new Program(idl, provider);
  if (!program.programId.equals(programId)) {
    throw new Error('Anchor Program client resolved an unexpected program ID');
  }
  return { connection, idl, program, programId, provider, rpcUrl, wallet, walletPath };
}

export function decodeUpgradeableProgramDataAddress(
  programData: Buffer,
): InstanceType<typeof PublicKey> {
  if (programData.length < 36 || programData.readUInt32LE(0) !== 2) {
    throw new Error('Program account does not contain UpgradeableLoaderState::Program');
  }
  return new PublicKey(programData.subarray(4, 36));
}

export function decodeUpgradeAuthority(
  programData: Buffer,
): InstanceType<typeof PublicKey> | null {
  if (programData.length < 13 || programData.readUInt32LE(0) !== 3) {
    throw new Error('Program-data account does not contain UpgradeableLoaderState::ProgramData');
  }
  const optionTag = programData[12];
  if (optionTag === 0) return null;
  if (optionTag !== 1 || programData.length < 45) {
    throw new Error('Program-data account has an invalid upgrade-authority encoding');
  }
  return new PublicKey(programData.subarray(13, 45));
}

export async function verifyDeployedUpgradeableProgram(
  context: DevnetContext,
  requireWalletAuthority = true,
): Promise<{ programDataAddress: InstanceType<typeof PublicKey>; upgradeAuthority: InstanceType<typeof PublicKey> | null }> {
  const programInfo = await context.connection.getAccountInfo(context.programId, 'confirmed');
  if (!programInfo || !programInfo.executable) {
    throw new Error(`Program ${context.programId.toBase58()} is not deployed on Devnet`);
  }
  if (!programInfo.owner.equals(BPF_UPGRADEABLE_LOADER)) {
    throw new Error(`Program is owned by ${programInfo.owner.toBase58()}, not the upgradeable loader`);
  }
  const programDataAddress = decodeUpgradeableProgramDataAddress(programInfo.data);
  const programDataInfo = await context.connection.getAccountInfo(programDataAddress, 'confirmed');
  if (!programDataInfo || !programDataInfo.owner.equals(BPF_UPGRADEABLE_LOADER)) {
    throw new Error(`Program-data account ${programDataAddress.toBase58()} is missing or has the wrong owner`);
  }
  const upgradeAuthority = decodeUpgradeAuthority(programDataInfo.data);
  if (requireWalletAuthority && !upgradeAuthority?.equals(context.wallet.publicKey)) {
    throw new Error(
      `Wallet ${context.wallet.publicKey.toBase58()} is not the program upgrade authority (${upgradeAuthority?.toBase58() ?? 'none'})`,
    );
  }
  return { programDataAddress, upgradeAuthority };
}

export function deriveConfigPda(programId: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId)[0];
}

export function explorerTransaction(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}

export function solscanTransaction(signature: string): string {
  return `https://solscan.io/tx/${signature}?cluster=devnet`;
}

export function explorerAddress(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function updateEvidenceFile(evidencePathInput: string | undefined, patch: Record<string, unknown>): void {
  if (!evidencePathInput) return;
  const evidencePath = path.resolve(evidencePathInput);
  let current: Record<string, unknown> = {};
  if (fs.existsSync(evidencePath)) {
    current = JSON.parse(fs.readFileSync(evidencePath, 'utf8')) as Record<string, unknown>;
  }
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  const temporaryPath = `${evidencePath}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, evidencePath);
}
