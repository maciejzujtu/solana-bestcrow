import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BN, web3 } from '@anchor-lang/core';
import {
  deriveConfigPda,
  explorerTransaction,
  loadDevnetContext,
  option,
  parseArgs,
  printJson,
  readWallet,
  solscanTransaction,
  updateEvidenceFile,
  verifyDeployedUpgradeableProgram,
} from './devnet-v2-common.js';

const { Keypair, PublicKey, SystemProgram, Transaction } = web3;
const CAMPAIGN_SEED = Buffer.from('campaign-v2');
const TRANCHE_SEED = Buffer.from('tranche-v2');
const VAULT_SEED = Buffer.from('vault-v2');
const BACKER_SEED = Buffer.from('backer-v2');
const DAY = 86_400;

function usage(): never {
  console.error(`Usage:
  npm run devnet:proof-3tranche -- [options]

Options:
  --rpc <URL>                    Devnet RPC URL
  --wallet <PATH>                creator keypair (defaults to ~/.config/solana/id.json)
  --backer-wallet <PATH>         second wallet for pledge (optional; generates temporary if omitted)
  --campaign-id <U64>            defaults to current Unix time in milliseconds
  --pledge-sol <NUMBER>          pledge amount in SOL (default: 0.1)
  --manifest <PATH>              path to terms manifest JSON (default: ../docs/manifests/proof-campaign-3tranche-terms.json)
  --evidence <PATH>              update deployment evidence JSON
  --execute                      send after a successful simulation
  --confirm-program-id <PUBKEY>  required with --execute

This script creates and seals a verified 3-tranche startup campaign (40% / 30% / 30%),
then pledges 0.1 SOL from a second wallet and produces Solscan verification URLs.`);
  process.exit(2);
}

function u64Seed(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('campaign-id must fit in u64');
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(value);
  return output;
}

export function canonicalizeJson(input: unknown): string {
  if (input === null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map(canonicalizeJson).join(',')}]`;
  }
  const entries = Object.entries(input as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalizeJson(v)}`).join(',')}}`;
}

type ConfigAccount = {
  feeBps: number;
  treasury: InstanceType<typeof PublicKey>;
  version: number;
};

type CampaignAccount = {
  campaignId: BN;
  status: Record<string, unknown>;
  trancheCount: number;
  version: number;
  raised: BN;
};

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.has('--help')) usage();

  const context = await loadDevnetContext(args);
  const { upgradeAuthority } = await verifyDeployedUpgradeableProgram(context, false);
  const configPda = deriveConfigPda(context.programId);
  const configClient = (context.program.account as Record<string, {
    fetchNullable(address: InstanceType<typeof PublicKey>): Promise<ConfigAccount | null>;
  }>).protocolConfigV2;

  const config = await configClient?.fetchNullable(configPda);

  const campaignIdInput = option(args, '--campaign-id') ?? String(Date.now());
  if (!/^\d+$/.test(campaignIdInput)) throw new Error('campaign-id must be an unsigned integer');
  const campaignId = BigInt(campaignIdInput);
  const campaignIdBuffer = u64Seed(campaignId);
  const creator = context.wallet.publicKey;

  const [campaign] = PublicKey.findProgramAddressSync(
    [CAMPAIGN_SEED, creator.toBuffer(), campaignIdBuffer],
    context.programId,
  );
  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, campaign.toBuffer()], context.programId);

  // 3 Tranches: 0 -> 40%, 1 -> 30%, 2 -> 30%
  const [tranche0] = PublicKey.findProgramAddressSync([TRANCHE_SEED, campaign.toBuffer(), Buffer.from([0])], context.programId);
  const [tranche1] = PublicKey.findProgramAddressSync([TRANCHE_SEED, campaign.toBuffer(), Buffer.from([1])], context.programId);
  const [tranche2] = PublicKey.findProgramAddressSync([TRANCHE_SEED, campaign.toBuffer(), Buffer.from([2])], context.programId);

  // Backer wallet
  const backerWalletPath = option(args, '--backer-wallet');
  const backerWallet = backerWalletPath ? readWallet(backerWalletPath) : null;
  const backerKeypair = backerWallet ? null : Keypair.generate();
  const backerPublicKey = backerWallet ? backerWallet.publicKey : backerKeypair!.publicKey;

  const [backerLedger] = PublicKey.findProgramAddressSync(
    [BACKER_SEED, campaign.toBuffer(), backerPublicKey.toBuffer()],
    context.programId,
  );

  const pledgeSolInput = option(args, '--pledge-sol', undefined, '0.1')!;
  const pledgeLamports = BigInt(Math.round(parseFloat(pledgeSolInput) * 1_000_000_000));
  const goalLamports = 10_000_000_000n; // 10 SOL

  // Canonical terms JSON
  const termsManifest = {
    schema: 'bestcrow/campaign-terms/v2',
    asset: 'SOL',
    campaign_id: campaignId.toString(),
    creator: creator.toBase58(),
    goal_lamports: goalLamports.toString(),
    funding_duration_seconds: 30 * DAY,
    fee_bps: 100,
    vote_duration_seconds: 7 * DAY,
    revision_duration_seconds: 30 * DAY,
    second_vote_duration_seconds: 7 * DAY,
    first_proof_deadline_seconds: 30 * DAY,
    tranches: [
      { index: 0, share_bps: 4000, proof_period_seconds: 30 * DAY, recipients: [{ address: creator.toBase58(), share_bps: 10000 }] },
      { index: 1, share_bps: 3000, proof_period_seconds: 30 * DAY, recipients: [{ address: creator.toBase58(), share_bps: 10000 }] },
      { index: 2, share_bps: 3000, proof_period_seconds: 30 * DAY, recipients: [{ address: creator.toBase58(), share_bps: 10000 }] },
    ],
    refund_policy: 'remaining_unreserved_pro_rata_v2',
    content_uri: `ar://bestcrow-devnet-proof-${campaignId}`,
  };

  const canonicalTermsJson = canonicalizeJson(termsManifest);
  const termsHash = [...createHash('sha256').update(canonicalTermsJson).digest()];
  const termsUri = `ar://bestcrow-devnet-proof-${campaignId}`;

  // Optionally save manifest
  const manifestPath = option(args, '--manifest');
  if (manifestPath) {
    const resolvedPath = path.resolve(manifestPath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    fs.writeFileSync(resolvedPath, JSON.stringify(termsManifest, null, 2));
  }

  const summary = {
    cluster: 'devnet',
    rpcUrl: context.rpcUrl,
    programId: context.programId.toBase58(),
    upgradeAuthority: upgradeAuthority?.toBase58() ?? null,
    configPda: configPda.toBase58(),
    configInitialized: Boolean(config && config.version === 2 && config.feeBps === 100),
    creator: creator.toBase58(),
    campaignId: campaignId.toString(),
    campaignPda: campaign.toBase58(),
    vaultPda: vault.toBase58(),
    tranches: [
      { index: 0, shareBps: 4000, percentage: '40%', pda: tranche0.toBase58() },
      { index: 1, shareBps: 3000, percentage: '30%', pda: tranche1.toBase58() },
      { index: 2, shareBps: 3000, percentage: '30%', pda: tranche2.toBase58() },
    ],
    termsHashHex: Buffer.from(termsHash).toString('hex'),
    termsUri,
    backer: backerPublicKey.toBase58(),
    backerLedgerPda: backerLedger.toBase58(),
    pledgeLamports: pledgeLamports.toString(),
    pledgeSol: pledgeSolInput,
  };

  if (!config || config.version !== 2 || config.feeBps !== 100) {
    printJson({
      status: 'blocked-config-uninitialized',
      blockerReason: `ProtocolConfigV2 (${configPda.toBase58()}) is not yet initialized on Devnet. Initialization requires upgrade authority ${upgradeAuthority?.toBase58()} signature.`,
      resolution: `Run 'npm run devnet:init-config -- --treasury <TREASURY_PUBKEY> --execute --confirm-treasury <TREASURY_PUBKEY>' with upgrade authority keypair.`,
      ...summary,
    });
    return;
  }

  const methods = context.program.methods as Record<string, (...values: unknown[]) => any>;

  // Transaction 1: Create, add 3 tranches, and seal terms
  const createTx = new Transaction().add(
    await methods
      .createCampaignDraftV2(new BN(campaignId.toString()), new BN(goalLamports.toString()), new BN(30 * DAY))
      .accountsStrict({ creator, config: configPda, campaign, vault, systemProgram: SystemProgram.programId })
      .instruction(),
    await methods
      .addTrancheV2(0, 4000, new BN(30 * DAY), [creator], [10_000])
      .accountsStrict({ creator, campaign, tranche: tranche0, systemProgram: SystemProgram.programId })
      .instruction(),
    await methods
      .addTrancheV2(1, 3000, new BN(30 * DAY), [creator], [10_000])
      .accountsStrict({ creator, campaign, tranche: tranche1, systemProgram: SystemProgram.programId })
      .instruction(),
    await methods
      .addTrancheV2(2, 3000, new BN(30 * DAY), [creator], [10_000])
      .accountsStrict({ creator, campaign, tranche: tranche2, systemProgram: SystemProgram.programId })
      .instruction(),
    await methods
      .sealTermsV2(termsHash, termsUri)
      .accountsStrict({ creator, campaign })
      .instruction(),
  );

  const simulation = await context.provider.simulate(createTx, [], 'confirmed');

  if (!args.flags.has('--execute')) {
    printJson({
      status: 'simulation-ok-not-sent',
      createSimulationUnits: simulation.unitsConsumed ?? null,
      ...summary,
    });
    console.error(
      `Dry-run simulation succeeded. Repeat with --execute --confirm-program-id ${context.programId.toBase58()} to send live transactions.`,
    );
    return;
  }

  if (args.options.get('--confirm-program-id') !== context.programId.toBase58()) {
    throw new Error('Refusing to send: --confirm-program-id must exactly match the deployed program ID');
  }

  // Execute Transaction 1
  const createSignature = await context.provider.sendAndConfirm(createTx, [], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  });

  // Transaction 2: Pledge 0.1 SOL
  const pledgeIx = await methods
    .pledgeV2(new BN(pledgeLamports.toString()))
    .accountsStrict({
      backer: backerPublicKey,
      campaign,
      ledger: backerLedger,
      vault,
      systemProgram: SystemProgram.programId,
    })
    .instruction();

  const pledgeTx = new Transaction().add(pledgeIx);
  let pledgeSignature: string;

  if (backerKeypair) {
    pledgeTx.feePayer = backerKeypair.publicKey;
    const { blockhash } = await context.connection.getLatestBlockhash('confirmed');
    pledgeTx.recentBlockhash = blockhash;
    pledgeTx.sign(backerKeypair);
    pledgeSignature = await context.connection.sendRawTransaction(pledgeTx.serialize());
    await context.connection.confirmTransaction(pledgeSignature, 'confirmed');
  } else {
    pledgeSignature = await context.provider.sendAndConfirm(pledgeTx, [], {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
      skipPreflight: false,
    });
  }

  const result = {
    status: 'proof-campaign-created-and-pledged',
    ...summary,
    createSignature,
    pledgeSignature,
    solscanCreateTx: solscanTransaction(createSignature),
    solscanPledgeTx: solscanTransaction(pledgeSignature),
    explorerCreateTx: explorerTransaction(createSignature),
    explorerPledgeTx: explorerTransaction(pledgeSignature),
  };

  updateEvidenceFile(args.options.get('--evidence'), {
    proofCampaignPda: campaign.toBase58(),
    proofCampaignId: campaignId.toString(),
    proofCreateSignature: createSignature,
    proofPledgeSignature: pledgeSignature,
    proofSolscanCreateUrl: solscanTransaction(createSignature),
    proofSolscanPledgeUrl: solscanTransaction(pledgeSignature),
  });

  printJson(result);
}

if (process.argv[1] && /(?:^|[/\\])devnet-v2-proof-3tranche\.[tj]s$/.test(process.argv[1])) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
