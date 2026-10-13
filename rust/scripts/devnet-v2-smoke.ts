import { createHash } from 'node:crypto';
import { BN, web3 } from '@anchor-lang/core';
import {
  deriveConfigPda,
  explorerTransaction,
  loadDevnetContext,
  option,
  parseArgs,
  printJson,
  updateEvidenceFile,
  verifyDeployedUpgradeableProgram,
} from './devnet-v2-common.js';

const { PublicKey, SystemProgram, Transaction } = web3;
const CAMPAIGN_SEED = Buffer.from('campaign-v2');
const TRANCHE_SEED = Buffer.from('tranche-v2');
const VAULT_SEED = Buffer.from('vault-v2');
const DAY = 86_400;

function usage(): never {
  console.error(`Usage:
  npm run devnet:smoke -- [options]

Options:
  --rpc <URL>                    Devnet RPC URL
  --wallet <PATH>                deployer/creator keypair
  --idl <PATH>                   generated IDL
  --program-id <PUBLIC_KEY>      must match the generated IDL
  --evidence <PATH>              update deployment evidence JSON
  --campaign-id <U64>            defaults to current Unix time in milliseconds
  --execute                      send after a successful simulation
  --confirm-program-id <PUBKEY>  required with --execute

The smoke transaction creates and seals one V2 campaign with two 50/50 tranches.
It transfers no pledge to the vault, but the fee payer pays account rent and fees.`);
  process.exit(2);
}

function u64Seed(value: bigint): Buffer {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('campaign-id must fit in u64');
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(value);
  return output;
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
  if (!config || config.version !== 2 || config.feeBps !== 100) {
    throw new Error(`ProtocolConfigV2 ${configPda.toBase58()} is missing or invalid`);
  }

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
  const [tranche0] = PublicKey.findProgramAddressSync(
    [TRANCHE_SEED, campaign.toBuffer(), Buffer.from([0])],
    context.programId,
  );
  const [tranche1] = PublicKey.findProgramAddressSync(
    [TRANCHE_SEED, campaign.toBuffer(), Buffer.from([1])],
    context.programId,
  );
  if (await context.connection.getAccountInfo(campaign, 'confirmed')) {
    throw new Error(`Smoke campaign PDA already exists; choose another --campaign-id (${campaign.toBase58()})`);
  }

  const methods = context.program.methods as Record<string, (...values: unknown[]) => any>;
  const createInstruction = await methods
    .createCampaignDraftV2(new BN(campaignId.toString()), new BN(10_000_000), new BN(7 * DAY))
    .accountsStrict({ creator, config: configPda, campaign, vault, systemProgram: SystemProgram.programId })
    .instruction();
  const tranche0Instruction = await methods
    .addTrancheV2(0, 5000, new BN(30 * DAY), [creator], [10_000])
    .accountsStrict({ creator, campaign, tranche: tranche0, systemProgram: SystemProgram.programId })
    .instruction();
  const tranche1Instruction = await methods
    .addTrancheV2(1, 5000, new BN(30 * DAY), [creator], [10_000])
    .accountsStrict({ creator, campaign, tranche: tranche1, systemProgram: SystemProgram.programId })
    .instruction();
  const termsText = `bestcrow-v2-devnet-smoke:${campaignId}`;
  const termsHash = [...createHash('sha256').update(termsText).digest()];
  const sealInstruction = await methods
    .sealTermsV2(termsHash, `ar://${termsText}`)
    .accountsStrict({ creator, campaign })
    .instruction();

  const transaction = new Transaction().add(
    createInstruction,
    tranche0Instruction,
    tranche1Instruction,
    sealInstruction,
  );
  const simulation = await context.provider.simulate(transaction, [], 'confirmed');
  const summary = {
    cluster: 'devnet',
    rpcUrl: context.rpcUrl,
    programId: context.programId.toBase58(),
    upgradeAuthority: upgradeAuthority?.toBase58() ?? null,
    feePayer: creator.toBase58(),
    treasury: config.treasury.toBase58(),
    configPda: configPda.toBase58(),
    campaignId: campaignId.toString(),
    campaignPda: campaign.toBase58(),
    tranchePdas: [tranche0.toBase58(), tranche1.toBase58()],
    pledgeLamports: '0',
    simulationUnitsConsumed: simulation.unitsConsumed ?? null,
  };

  if (!args.flags.has('--execute')) {
    printJson({ status: 'simulation-ok-not-sent', ...summary });
    console.error(
      `No transaction sent. Review the summary, then repeat with --execute --confirm-program-id ${context.programId.toBase58()}`,
    );
    return;
  }
  if (args.options.get('--confirm-program-id') !== context.programId.toBase58()) {
    throw new Error('Refusing to send: --confirm-program-id must exactly match the deployed program ID');
  }

  const signature = await context.provider.sendAndConfirm(transaction, [], {
    commitment: 'confirmed',
    preflightCommitment: 'confirmed',
    skipPreflight: false,
  });
  const campaignClient = (context.program.account as Record<string, {
    fetch(address: InstanceType<typeof PublicKey>): Promise<CampaignAccount>;
  }>).campaignV2;
  const created = await campaignClient.fetch(campaign);
  if (
    created.version !== 2
    || created.trancheCount !== 2
    || created.campaignId.toString() !== campaignId.toString()
    || !('funding' in created.status)
  ) {
    throw new Error(`Smoke transaction ${signature} confirmed, but campaign verification failed`);
  }

  const evidence = {
    status: 'smoke-ok',
    ...summary,
    smokeTestSignatures: [signature],
    explorer: explorerTransaction(signature),
  };
  updateEvidenceFile(args.options.get('--evidence'), {
    smokeCampaignPda: campaign.toBase58(),
    smokeTestSignatures: [signature],
    smokeExplorers: [explorerTransaction(signature)],
  });
  printJson(evidence);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
