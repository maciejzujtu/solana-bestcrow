'use client';

import { useEffect, useMemo, useState } from 'react';
import { address, type Address } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';

import {
  BACKER_LEDGER_V2_SIZE,
  BPS_DENOMINATOR,
  CAMPAIGN_V2_SIZE,
  DAY_SECONDS,
  FEE_BPS_V2,
  MOCK_CONTENT_URI,
  TRANCHE_V2_SIZE,
  addTrancheV2Ix,
  arweaveGatewayUrl,
  campaignV2Pda,
  canonicalizeTermsV2,
  createCampaignDraftV2Ix,
  explorerTransactionUrl,
  fetchCampaignContentV2,
  formatSolV2,
  getCampaignV2,
  getMockArweave,
  getProtocolConfigV2,
  getTrancheV2,
  hashCanonicalTermsV2,
  hashesEqual,
  isMockArweaveUri,
  parseSolV2,
  saveMockArweave,
  sealTermsV2Ix,
  type CampaignTermsV2,
} from '../../lib/charity-vault-v2';
import { sendV2Transaction } from '../../lib/send-v2-transaction';
import { client } from '../../providers';
import { withRpcRetry } from '../../lib/rpc-retry';

type TrancheDraft = { title: string; share: string; proofDays: string; recipients: string };
type FormDraft = {
  campaignId: string;
  title: string;
  description: string;
  goal: string;
  fundingDays: string;
  contentUri: string;
  termsUri: string;
  tranches: TrancheDraft[];
};
type PreparedDraft = {
  campaignId: bigint;
  goal: bigint;
  duration: number;
  campaign: Address;
  terms: CampaignTermsV2;
  canonical: string;
  hash: Uint8Array;
  recipients: { addresses: Address[]; shares: number[] }[];
  estimatedCost: bigint;
  walletBalance: bigint;
  rent: { campaign: bigint; tranche: bigint; vault: bigint };
};

const defaultTranche = (index: number): TrancheDraft => ({
  title: `Milestone ${index + 1}`,
  share: index === 0 ? '50' : '50',
  proofDays: '30',
  recipients: '',
});
const initialForm: FormDraft = {
  campaignId: '', title: '', description: '', goal: '', fundingDays: '30', contentUri: MOCK_CONTENT_URI, termsUri: '',
  tranches: [defaultTranche(0), defaultTranche(1)],
};

function parsePercent(value: string, label: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error(`${label} must use at most two decimal places.`);
  const [whole, fraction = ''] = value.split('.');
  const bps = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (bps <= 0 || bps > 10_000) throw new Error(`${label} must be above 0% and no more than 100%.`);
  return bps;
}

function parseRecipients(value: string, creator: Address, label: string): { addresses: Address[]; shares: number[] } {
  const lines = value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { addresses: [creator], shares: [BPS_DENOMINATOR] };
  if (lines.length > 5) throw new Error(`${label} supports at most five recipients.`);
  const parsed = lines.map((line) => {
    const match = /^(\S+)\s+(\d+(?:\.\d{1,2})?)%?$/.exec(line);
    if (!match) throw new Error(`${label}: use one “wallet percent” pair per line.`);
    return { address: address(match[1]!), share: parsePercent(match[2]!, `${label} recipient share`) };
  });
  if (new Set(parsed.map((item) => item.address)).size !== parsed.length) throw new Error(`${label} has a duplicate recipient.`);
  if (parsed.reduce((sum, item) => sum + item.share, 0) !== BPS_DENOMINATOR) throw new Error(`${label} recipient shares must total 100%.`);
  return { addresses: parsed.map((item) => item.address), shares: parsed.map((item) => item.share) };
}

function savedDraftKey(wallet: string): string { return `bestcrow:v2-draft:${wallet}`; }

function normalizeDraft(value: unknown): FormDraft | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<FormDraft>;
  const tranches = Array.isArray(candidate.tranches)
    ? candidate.tranches.flatMap((item, index) => {
      if (!item || typeof item !== 'object') return [];
      const tranche = item as Partial<TrancheDraft>;
      const fallback = defaultTranche(index);
      return [{
        title: typeof tranche.title === 'string' ? tranche.title : fallback.title,
        share: typeof tranche.share === 'string' ? tranche.share : fallback.share,
        proofDays: typeof tranche.proofDays === 'string' ? tranche.proofDays : fallback.proofDays,
        recipients: typeof tranche.recipients === 'string' ? tranche.recipients : '',
      }];
    })
    : [];
  if (tranches.length < 2 || tranches.length > 5) return null;
  return {
    campaignId: typeof candidate.campaignId === 'string' ? candidate.campaignId : '',
    title: typeof candidate.title === 'string' ? candidate.title : '',
    description: typeof candidate.description === 'string' ? candidate.description : '',
    goal: typeof candidate.goal === 'string' ? candidate.goal : '',
    fundingDays: typeof candidate.fundingDays === 'string' ? candidate.fundingDays : '30',
    contentUri: typeof candidate.contentUri === 'string' ? candidate.contentUri : '',
    termsUri: typeof candidate.termsUri === 'string' ? candidate.termsUri : '',
    tranches,
  };
}

function saveDraft(wallet: string, draft: FormDraft): void {
  try { localStorage.setItem(savedDraftKey(wallet), JSON.stringify(draft)); } catch { /* Storage is an optional resume aid. */ }
}

export default function CampaignForm() {
  const connected = useConnectedWallet(client);
  const [form, setForm] = useState<FormDraft>(initialForm);
  const [prepared, setPrepared] = useState<PreparedDraft | null>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipts, setReceipts] = useState<string[]>([]);

  const walletAddress = connected?.account.address ?? '';
  useEffect(() => {
    if (!walletAddress) return;
    try {
      const saved = localStorage.getItem(savedDraftKey(walletAddress));
      if (saved) {
        const draft = normalizeDraft(JSON.parse(saved));
        if (draft) setForm(draft);
      }
    } catch { /* A malformed local draft must not block a fresh form. */ }
  }, [walletAddress]);

  const feePreview = useMemo(() => {
    try {
      const gross = parseSolV2(form.goal || '0');
      const fee = (gross * BigInt(FEE_BPS_V2)) / BigInt(BPS_DENOMINATOR);
      return { fee, net: gross - fee };
    } catch { return null; }
  }, [form.goal]);

  function update<K extends keyof Omit<FormDraft, 'tranches'>>(field: K, value: FormDraft[K]) {
    setPrepared(null);
    setForm((current) => {
      const next = { ...current, [field]: value };
      if (walletAddress) saveDraft(walletAddress, next);
      return next;
    });
  }
  function updateTranche(index: number, patch: Partial<TrancheDraft>) {
    setPrepared(null);
    setForm((current) => {
      const next = { ...current, tranches: current.tranches.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) };
      if (walletAddress) saveDraft(walletAddress, next);
      return next;
    });
  }
  function resizeTranches(count: number) {
    setPrepared(null);
    setForm((current) => {
      const next = {
      ...current,
      tranches: Array.from({ length: count }, (_, index) => current.tranches[index] ?? defaultTranche(index)),
      };
      if (walletAddress) saveDraft(walletAddress, next);
      return next;
    });
  }

  function updateTermsUri(value: string) {
    setForm((current) => {
      const next = { ...current, termsUri: value.trim() };
      if (walletAddress) saveDraft(walletAddress, next);
      return next;
    });
  }

  async function prepare() {
    setStatus('');
    setReceipts([]);
    try {
      if (!connected?.signer) throw new Error('Connect a signing wallet before preparing immutable terms.');
      if (!/^\d+$/.test(form.campaignId)) throw new Error('Campaign ID must be a non-negative whole number.');
      if (form.title.trim().length < 3) throw new Error('Campaign title must have at least three characters.');
      if (form.description.trim().length < 20) throw new Error('Description must have at least 20 characters.');
      const campaignId = BigInt(form.campaignId);
      const goal = parseSolV2(form.goal);
      const fundingDays = Number(form.fundingDays);
      if (!Number.isInteger(fundingDays) || fundingDays < 7 || fundingDays > 183) throw new Error('Funding duration must be 7–183 full days.');
      if (form.tranches.length < 2 || form.tranches.length > 5) throw new Error('Choose 2–5 milestones.');
      const contentUri = form.contentUri.trim() || MOCK_CONTENT_URI;
      arweaveGatewayUrl(contentUri);
      if (form.termsUri) arweaveGatewayUrl(form.termsUri);

      saveMockArweave(contentUri, JSON.stringify({
        title: form.title.trim(),
        description: form.description.trim(),
        milestones: form.tranches.map((item) => ({ title: item.title.trim() })),
      }));

      const creator = address(connected.account.address);
      const shares = form.tranches.map((item, index) => parsePercent(item.share, `Milestone ${index + 1} share`));
      if (shares.some((share) => share > 5_000)) throw new Error('Each milestone may receive at most 50%.');
      if (shares.reduce((sum, share) => sum + share, 0) !== BPS_DENOMINATOR) throw new Error('Milestone shares must total exactly 100%.');
      const proofDays = form.tranches.map((item, index) => {
        const value = Number(item.proofDays);
        if (!Number.isInteger(value) || value < 1 || value > 183) throw new Error(`Milestone ${index + 1} proof period must be 1–183 days.`);
        return value;
      });
      form.tranches.forEach((item, index) => {
        if (item.title.trim().length === 0) throw new Error(`Milestone ${index + 1} needs a public title.`);
      });
      const recipients = form.tranches.map((item, index) => parseRecipients(item.recipients, creator, `Milestone ${index + 1}`));
      const campaign = await campaignV2Pda(creator, campaignId);
      const terms: CampaignTermsV2 = {
        schema: 'bestcrow/campaign-terms/v2',
        asset: 'SOL',
        campaign_id: campaignId.toString(),
        creator,
        goal_lamports: goal.toString(),
        funding_duration_seconds: fundingDays * DAY_SECONDS,
        fee_bps: 100,
        vote_duration_seconds: 604_800,
        revision_duration_seconds: 2_592_000,
        second_vote_duration_seconds: 604_800,
        first_proof_deadline_seconds: 2_592_000,
        tranches: form.tranches.map((item, index) => ({
          index,
          share_bps: shares[index]!,
          proof_period_seconds: proofDays[index]! * DAY_SECONDS,
          recipients: recipients[index]!.addresses.map((value, recipientIndex) => ({ address: value, share_bps: recipients[index]!.shares[recipientIndex]! })),
        })),
        refund_policy: 'remaining_unreserved_pro_rata_v2',
        content_uri: contentUri,
      };
      const content = await fetchCampaignContentV2(terms);
      if (content.title.trim() !== form.title.trim() || content.description.trim() !== form.description.trim()) {
        throw new Error('The title or description at the public content URI differs from this form. Publish the exact content first.');
      }
      if (!content.milestones || content.milestones.length !== form.tranches.length || content.milestones.some((item, index) => item.title.trim() !== form.tranches[index]!.title.trim())) {
        throw new Error('The public content document must contain milestone titles matching this form in the same order.');
      }
      const canonical = canonicalizeTermsV2(terms);
      const hash = await hashCanonicalTermsV2(terms);
      const mockTermsUri = `ar://mock_terms_${campaignId.toString().padStart(32, '0')}`;
      const termsUri = form.termsUri.trim() || mockTermsUri;
      saveMockArweave(termsUri, canonical);
      if (!form.termsUri) {
        updateTermsUri(termsUri);
      }
      const config = await getProtocolConfigV2(client);
      if (!config) throw new Error('ProtocolConfigV2 is not initialized on Devnet. Campaign creation is disabled until deployment is complete.');
      const [campaignRent, trancheRent, vaultRent, balance] = await Promise.all([
        withRpcRetry(() => client.rpc.getMinimumBalanceForRentExemption(BigInt(CAMPAIGN_V2_SIZE), { commitment: 'confirmed' }).send()),
        withRpcRetry(() => client.rpc.getMinimumBalanceForRentExemption(BigInt(TRANCHE_V2_SIZE), { commitment: 'confirmed' }).send()),
        withRpcRetry(() => client.rpc.getMinimumBalanceForRentExemption(0n, { commitment: 'confirmed' }).send()),
        withRpcRetry(() => client.rpc.getBalance(creator, { commitment: 'confirmed' }).send()).then((result) => result.value),
      ]);
      const transactionCount = BigInt(form.tranches.length + 2);
      const estimatedCost = campaignRent + trancheRent * BigInt(form.tranches.length) + vaultRent + transactionCount * 5_000n;
      setPrepared({ campaignId, goal, duration: fundingDays * DAY_SECONDS, campaign, terms, canonical, hash, recipients, estimatedCost, walletBalance: balance, rent: { campaign: campaignRent, tranche: trancheRent, vault: vaultRent } });
      saveDraft(walletAddress, form);
      setStatus('Review ready. Dev mock terms are ready or you can publish the downloaded JSON unchanged, then start the resumable transaction sequence.');
    } catch (error) {
      setPrepared(null);
      setStatus(error instanceof Error ? error.message : 'Could not prepare the campaign.');
    }
  }

  function downloadManifest() {
    if (!prepared) return;
    const url = URL.createObjectURL(new Blob([prepared.canonical], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `bestcrow-${prepared.campaignId}-terms.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function verifyPublishedManifest(expected: PreparedDraft): Promise<void> {
    if (!form.termsUri) throw new Error('Publish the canonical JSON first, then enter its permanent ar:// terms URI.');
    const mock = getMockArweave(form.termsUri);
    let raw: string;
    if (mock) {
      raw = mock;
    } else {
      const response = await fetch(arweaveGatewayUrl(form.termsUri), { cache: 'no-store' });
      if (!response.ok) throw new Error(`The published terms document is not available yet (${response.status}).`);
      raw = await response.text();
    }
    if (raw.length > 256_000) throw new Error('The published terms document is unexpectedly large.');
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('The published terms document is not valid JSON.'); }
    const published = canonicalizeTermsV2(parsed as CampaignTermsV2);
    if (published !== expected.canonical) throw new Error('Published terms differ from this review. Download and upload the current canonical JSON without edits.');
  }

  async function execute() {
    if (!prepared || !connected?.signer) return;
    setBusy(true);
    setStatus('Verifying the permanent terms document before any wallet prompt…');
    try {
      const creator = address(connected.account.address);
      if (prepared.terms.creator !== creator) {
        throw new Error('The connected wallet changed after review. Review the campaign again before signing.');
      }
      await verifyPublishedManifest(prepared);
      let campaign = await getCampaignV2(client, prepared.campaign);
      if (campaign && campaign.trancheCount > prepared.terms.tranches.length) {
        throw new Error('The existing draft already has more milestones than this saved form. Use the original manifest to resume it.');
      }
      const missingTranches = campaign ? prepared.terms.tranches.length - campaign.trancheCount : prepared.terms.tranches.length;
      const remainingCost = (campaign ? 0n : prepared.rent.campaign + prepared.rent.vault)
        + prepared.rent.tranche * BigInt(missingTranches)
        + 5_000n * BigInt(campaign ? missingTranches + 1 : prepared.terms.tranches.length + 2);
      const { value: currentBalance } = await withRpcRetry(() => client.rpc.getBalance(creator, { commitment: 'confirmed' }).send());
      if (currentBalance < remainingCost) {
        throw new Error(`Wallet balance is ${formatSolV2(currentBalance)} SOL; this resume step needs about ${formatSolV2(remainingCost)} SOL for rent and network fees.`);
      }
      if (!campaign) {
        setStatus('Step 1: simulate, sign and create the V2 draft on Devnet.');
        const { ix } = await createCampaignDraftV2Ix(creator, prepared.campaignId, prepared.goal, prepared.duration);
        const result = await sendV2Transaction(client, creator, connected.signer, [ix]);
        setReceipts((current) => [...current, result.signature]);
        if (result.confirmation !== 'confirmed') {
          setStatus(`Draft submitted as ${result.signature}, but confirmation is still pending. Do not sign it again; use Resume after Explorer confirms it.`);
          return;
        }
        campaign = await getCampaignV2(client, prepared.campaign);
      }
      if (!campaign) throw new Error('The confirmed draft account could not be read. Wait for RPC propagation, then resume.');
      if (campaign.creator !== creator || campaign.campaignId !== prepared.campaignId || campaign.goal !== prepared.goal || campaign.fundingDuration !== prepared.duration) {
        throw new Error('The existing draft at this PDA has different immutable values. Use another campaign ID.');
      }
      if (campaign.status !== 'Draft') {
        if (campaign.status === 'Funding' && campaign.termsUri === form.termsUri && hashesEqual(campaign.termsHash, prepared.hash)) {
          localStorage.removeItem(savedDraftKey(walletAddress));
          setStatus(`Campaign is already sealed and accepting contributions at ${campaign.address}.`);
          return;
        }
        throw new Error(`This campaign is already ${campaign.status.toLowerCase()} and cannot be edited.`);
      }

      for (let index = 0; index < campaign.trancheCount; index += 1) {
        const existing = await getTrancheV2(client, campaign.address, index);
        const expected = prepared.terms.tranches[index]!;
        const expectedRecipients = prepared.recipients[index]!;
        if (!existing || existing.shareBps !== expected.share_bps || existing.proofPeriodSeconds !== expected.proof_period_seconds ||
          existing.recipients.join(',') !== expectedRecipients.addresses.join(',') ||
          existing.recipientSharesBps.join(',') !== expectedRecipients.shares.join(',')) {
          throw new Error(`Existing milestone ${index + 1} differs from the saved draft. Terms cannot be safely resumed.`);
        }
      }
      for (let index = campaign.trancheCount; index < prepared.terms.tranches.length; index += 1) {
        const tranche = prepared.terms.tranches[index]!;
        const recipients = prepared.recipients[index]!;
        setStatus(`Step ${index + 2}: simulate, sign and add milestone ${index + 1} of ${prepared.terms.tranches.length}.`);
        const ix = await addTrancheV2Ix(creator, campaign.address, index, tranche.share_bps, tranche.proof_period_seconds, recipients.addresses, recipients.shares);
        const result = await sendV2Transaction(client, creator, connected.signer, [ix]);
        setReceipts((current) => [...current, result.signature]);
        if (result.confirmation !== 'confirmed') {
          setStatus(`Milestone ${index + 1} was submitted as ${result.signature}, but confirmation is pending. Do not repeat it; resume after Explorer confirms it.`);
          return;
        }
      }

      setStatus('Final step: simulate and sign the irreversible seal. Funding begins only after this confirms.');
      const seal = await sealTermsV2Ix(creator, campaign.address, prepared.hash, form.termsUri);
      const result = await sendV2Transaction(client, creator, connected.signer, [seal]);
      setReceipts((current) => [...current, result.signature]);
      if (result.confirmation === 'confirmed') {
        localStorage.removeItem(savedDraftKey(walletAddress));
        setStatus(`Campaign sealed. Terms are immutable and fundraising is active at ${campaign.address}.`);
      } else {
        setStatus(`Seal submitted as ${result.signature}, but confirmation is pending. Do not sign it again; check Explorer before resuming.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Campaign sequence failed. The confirmed steps remain resumable.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Resumable V2 draft · Devnet</p>
        <h1 id="new-campaign-title" className="display-font mt-3 text-5xl font-semibold">Create campaign</h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">Prepare all terms, publish the canonical manifest, then create the draft milestone by milestone. Only the final seal starts fundraising and makes the schedule immutable.</p>
      </header>

      <form className="space-y-6" onSubmit={(event) => { event.preventDefault(); void prepare(); }} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Campaign ID" hint="A unique whole number for this creator wallet."><input value={form.campaignId} onChange={(event) => update('campaignId', event.target.value)} className="field" inputMode="numeric" required /></Field>
          <Field label="Goal (SOL)"><input value={form.goal} onChange={(event) => update('goal', event.target.value)} className="field" inputMode="decimal" placeholder="10" required /></Field>
          <Field label="Funding duration (days)" hint="7–183 full days; the clock starts when terms are sealed."><input value={form.fundingDays} onChange={(event) => update('fundingDays', event.target.value)} className="field" type="number" min="7" max="183" required /></Field>
          <Field label="Number of milestones"><select className="field" value={form.tranches.length} onChange={(event) => resizeTranches(Number(event.target.value))}>{[2, 3, 4, 5].map((count) => <option key={count} value={count}>{count}</option>)}</select></Field>
        </div>
        <Field label="Startup title"><input value={form.title} onChange={(event) => update('title', event.target.value)} className="field" required /></Field>
        <Field label="Public description"><textarea value={form.description} onChange={(event) => update('description', event.target.value)} className="field min-h-28" required /></Field>
        <Field label="Public content URI" hint="Permanent ar:// document or default dev mock.">
          <div className="flex gap-2">
            <input value={form.contentUri} onChange={(event) => update('contentUri', event.target.value.trim())} className="field font-mono text-xs flex-1" placeholder="ar://…" required />
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold whitespace-nowrap hover:bg-slate-100" onClick={() => update('contentUri', MOCK_CONTENT_URI)}>Use dev mock</button>
          </div>
        </Field>

        <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
          <legend className="px-2 font-semibold">Milestone schedule</legend>
          {form.tranches.map((tranche, index) => (
            <section key={index} className="rounded-xl bg-slate-50 p-4" aria-labelledby={`tranche-${index}-title`}>
              <h2 id={`tranche-${index}-title`} className="font-semibold">{index === 0 ? 'Initial milestone' : `Milestone ${index + 1}`}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Title"><input className="field" value={tranche.title} onChange={(event) => updateTranche(index, { title: event.target.value })} required /></Field>
                <Field label="Share (%)" hint="Maximum 50%."><input className="field" value={tranche.share} onChange={(event) => updateTranche(index, { share: event.target.value })} inputMode="decimal" required /></Field>
                <Field label="Proof period (days)" hint="1–183 days."><input className="field" value={tranche.proofDays} onChange={(event) => updateTranche(index, { proofDays: event.target.value })} type="number" min="1" max="183" required /></Field>
              </div>
              <Field label="Recipients and split" hint="Optional. One “wallet percent” pair per line, e.g. ADDRESS 70. Blank means the creator receives 100%."><textarea className="field mt-1 min-h-20 font-mono text-xs" value={tranche.recipients} onChange={(event) => updateTranche(index, { recipients: event.target.value })} /></Field>
            </section>
          ))}
        </fieldset>

        <div className="rounded-2xl bg-emerald-50 p-5 text-sm">
          <p className="font-semibold">Financial preview</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            <Preview label="Success fee" value={feePreview ? `${formatSolV2(feePreview.fee)} SOL (1%)` : '—'} />
            <Preview label="Net milestone budget" value={feePreview ? `${formatSolV2(feePreview.net)} SOL` : '—'} />
            <Preview label="Creator deposit" value="0 SOL" />
          </dl>
          <p className="mt-3 text-xs leading-5 text-slate-600">The fee applies only after a successful funding period. Rent and network fees are separate and shown after review.</p>
        </div>

        <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50" type="submit" disabled={busy}>Review complete terms</button>
      </form>

      {prepared ? (
        <section className="space-y-5 rounded-2xl border-2 border-slate-950 bg-white p-6" aria-labelledby="review-title">
          <div><p className="text-xs font-bold uppercase tracking-[.18em] text-amber-700">Review before signatures</p><h2 id="review-title" className="mt-2 text-2xl font-semibold">Immutable V2 summary</h2></div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Preview label="Campaign PDA" value={prepared.campaign} mono />
            <Preview label="Fee payer / creator" value={prepared.terms.creator} mono />
            <Preview label="Goal" value={`${formatSolV2(prepared.goal)} SOL`} />
            <Preview label="Milestones" value={`${prepared.terms.tranches.length} · ${prepared.terms.tranches.map((item) => `${item.share_bps / 100}%`).join(' / ')}`} />
            <Preview label="Estimated setup cost" value={`~${formatSolV2(prepared.estimatedCost)} SOL`} />
            <Preview label="Wallet balance" value={`${formatSolV2(prepared.walletBalance)} SOL`} />
          </dl>
          <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6"><strong>{prepared.terms.tranches.length + 2} separate approvals.</strong> Create draft, add each milestone, then seal. If one step fails, confirmed steps remain on-chain and the same saved draft resumes from the next missing step.</div>
          <button type="button" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold" onClick={downloadManifest}>Download canonical terms JSON</button>
          <Field label="Published terms manifest URI" hint="Upload the downloaded file unchanged to Arweave, or keep the auto-filled dev mock URI.">
            <div className="flex gap-2">
              <input value={form.termsUri} onChange={(event) => updateTermsUri(event.target.value)} className="field font-mono text-xs flex-1" placeholder="ar://…" required />
              <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold whitespace-nowrap hover:bg-slate-100" onClick={() => {
                if (prepared) {
                  const mock = `ar://mock_terms_${prepared.campaignId.toString().padStart(32, '0')}`;
                  saveMockArweave(mock, prepared.canonical);
                  updateTermsUri(mock);
                }
              }}>Use dev mock</button>
            </div>
          </Field>
          <p className="text-sm leading-6">By starting, you confirm that you reviewed the recipient wallets, percentages, 1% success fee, and understand that the final seal cannot be edited.</p>
          <button type="button" className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !form.termsUri} onClick={() => void execute()}>{busy ? 'Processing current step…' : 'Start or resume V2 transactions'}</button>
        </section>
      ) : null}

      {status ? <p className="break-words rounded-xl bg-slate-100 p-4 text-sm leading-6" role="status" aria-live="polite">{status}</p> : null}
      {receipts.length > 0 ? <section aria-label="Confirmed and submitted transactions"><h2 className="text-sm font-semibold">Transaction history for this attempt</h2><ol className="mt-2 space-y-1 text-xs">{receipts.map((signature, index) => <li key={signature}><a className="break-all text-emerald-800 underline" href={explorerTransactionUrl(signature)} target="_blank" rel="noreferrer">Step {index + 1}: {signature}</a></li>)}</ol></section> : null}
      <p className="text-xs leading-5 text-slate-500">Account-size note: each backer later funds a separate {BACKER_LEDGER_V2_SIZE}-byte ledger. This setup estimate covers only the campaign, vault and milestone accounts.</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="block text-sm font-medium">{label}{children}{hint ? <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{hint}</span> : null}</label>;
}
function Preview({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 break-all font-medium ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd></div>;
}
