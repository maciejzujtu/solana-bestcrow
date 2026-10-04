'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { address, type Address, type Instruction } from '@solana/kit';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';

import { client } from '../../providers';
import {
  BPS_DENOMINATOR,
  arweaveGatewayUrl,
  cancelPledgeV2Ix,
  canonicalizeJson,
  claimRefundV2Ix,
  claimTerminationRefundV2Ix,
  explorerTransactionUrl,
  fetchCampaignContentV2,
  fetchVerifiedTermsV2,
  finalizeFundingV2Ix,
  finalizeProofTimeoutV2Ix,
  finalizeVoteV2Ix,
  formatSolV2,
  getBackerLedgerV2,
  getCampaignV2,
  getClaimV2,
  getMockArweave,
  getProtocolConfigV2,
  getTranchesV2,
  hasVoteRecordV2,
  isMockArweaveUri,
  parseSolV2,
  pledgeV2Ix,
  releaseTrancheV2Ix,
  returnFundsV2Ix,
  submitEvidenceV2Ix,
  terminateV2Ix,
  voteMilestoneV2Ix,
  withdrawClaimV2Ix,
  type BackerLedgerV2,
  type CampaignTermsV2,
  type CampaignContentV2,
  type CampaignV2,
  type ClaimV2,
  type ProtocolConfigV2,
  type TrancheV2,
  validateTermsAgainstCampaignV2,
} from '../../lib/charity-vault-v2';
import { sendV2Transaction } from '../../lib/send-v2-transaction';

type ReviewAction = { title: string; details: string[]; build: () => Promise<Instruction> };

export default function CampaignPage() {
  const params = useParams<{ address: string }>();
  const connected = useConnectedWallet(client);
  const [campaign, setCampaign] = useState<CampaignV2 | null>(null);
  const [tranches, setTranches] = useState<TrancheV2[]>([]);
  const [claims, setClaims] = useState<Record<number, ClaimV2 | null>>({});
  const [ledger, setLedger] = useState<BackerLedgerV2 | null>(null);
  const [config, setConfig] = useState<ProtocolConfigV2 | null>(null);
  const [terms, setTerms] = useState<CampaignTermsV2 | null>(null);
  const [content, setContent] = useState<CampaignContentV2 | null>(null);
  const [termsError, setTermsError] = useState('');
  const [voted, setVoted] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [review, setReview] = useState<ReviewAction | null>(null);
  const [pledgeAmount, setPledgeAmount] = useState('');
  const [returnAmount, setReturnAmount] = useState('');
  const [evidenceUris, setEvidenceUris] = useState<Record<number, string>>({});

  const wallet = connected ? address(connected.account.address) : null;
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const campaignAddress = address(params.address);
        const nextCampaign = await getCampaignV2(client, campaignAddress);
        if (!nextCampaign) throw new Error('CampaignV2 account was not found on Devnet.');
        const [nextTranches, nextLedger, nextConfig] = await Promise.all([
          getTranchesV2(client, nextCampaign),
          wallet ? getBackerLedgerV2(client, nextCampaign.address, wallet) : Promise.resolve(null),
          getProtocolConfigV2(client),
        ]);
        const nextClaims = Object.fromEntries(await Promise.all(nextTranches.map(async (tranche) => [tranche.index, await getClaimV2(client, nextCampaign.address, tranche.index)])));
        const nextVoted = wallet ? Object.fromEntries(await Promise.all(nextTranches.map(async (tranche) => [tranche.index, await hasVoteRecordV2(client, tranche, wallet)]))) : {};
        let nextTerms: CampaignTermsV2 | null = null;
        let nextContent: CampaignContentV2 | null = null;
        let nextTermsError = '';
        if (nextCampaign.status !== 'Draft') {
          try {
            nextTerms = (await fetchVerifiedTermsV2(nextCampaign)).terms;
            validateTermsAgainstCampaignV2(nextCampaign, nextTerms, nextTranches);
            nextContent = await fetchCampaignContentV2(nextTerms);
          }
          catch (reason) { nextTermsError = reason instanceof Error ? reason.message : 'Canonical terms could not be verified.'; }
        }
        if (!active) return;
        setCampaign(nextCampaign);
        setTranches(nextTranches);
        setLedger(nextLedger);
        setConfig(nextConfig);
        setClaims(nextClaims);
        setVoted(nextVoted);
        setTerms(nextTerms);
        setContent(nextContent);
        setTermsError(nextTermsError);
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Campaign could not be loaded.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [params.address, wallet, refresh]);

  function queue(title: string, details: string[], build: () => Promise<Instruction>) {
    setStatus('');
    setReview({ title, details, build });
  }

  async function submitReview() {
    if (!review || !wallet || !connected?.signer) return;
    setBusy(true);
    setStatus('Simulating on Devnet before opening the wallet…');
    try {
      const ix = await review.build();
      const result = await sendV2Transaction(client, wallet, connected.signer, [ix]);
      setReview(null);
      setStatus(result.confirmation === 'confirmed'
        ? `Confirmed: ${explorerTransactionUrl(result.signature)}`
        : `Submitted but not confirmed within 30 seconds. Do not repeat it yet: ${explorerTransactionUrl(result.signature)}`);
      if (result.confirmation === 'confirmed') setRefresh((value) => value + 1);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Transaction failed.');
    } finally {
      setBusy(false);
    }
  }

  async function queueEvidence(tranche: TrancheV2) {
    if (!campaign || !wallet) return;
    const uri = (evidenceUris[tranche.index] ?? '').trim();
    setBusy(true);
    setStatus('Fetching and canonicalizing the public evidence manifest…');
    try {
      const mock = getMockArweave(uri);
      let document: Record<string, unknown>;
      if (mock) {
        document = JSON.parse(mock) as Record<string, unknown>;
      } else {
        const response = await fetch(arweaveGatewayUrl(uri), { cache: 'no-store' });
        if (!response.ok) {
          if (isMockArweaveUri(uri)) {
            document = {
              attachments: [],
              campaign: campaign.address,
              round: tranche.round,
              schema: 'bestcrow/milestone-proof/v2',
              submitted_at: Math.floor(Date.now() / 1000),
              summary_sha256: '0'.repeat(64),
              summary_uri: uri,
              title: `Milestone ${tranche.index + 1} proof`,
              tranche_index: tranche.index,
            };
          } else {
            throw new Error(`Evidence document is unavailable (${response.status}).`);
          }
        } else {
          document = await response.json() as Record<string, unknown>;
        }
      }
      const keys = Object.keys(document).sort().join(',');
      if (keys !== 'attachments,campaign,round,schema,submitted_at,summary_sha256,summary_uri,title,tranche_index' ||
        document.schema !== 'bestcrow/milestone-proof/v2' || document.campaign !== campaign.address ||
        document.tranche_index !== tranche.index || document.round !== tranche.round ||
        !Number.isInteger(document.submitted_at) || typeof document.title !== 'string' ||
        typeof document.summary_uri !== 'string' || typeof document.summary_sha256 !== 'string' ||
        !Array.isArray(document.attachments)) {
        throw new Error('Evidence manifest fields do not match this campaign, milestone and voting round.');
      }
      const canonical = canonicalizeJson(document);
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
      queue('Submit milestone evidence', [
        `Campaign: ${campaign.address}`,
        `Milestone: ${tranche.index + 1}`,
        `Evidence: ${uri}`,
        'State change: opens the 7-day vote (or schedules the second vote after revision).',
      ], () => submitEvidenceV2Ix(wallet, campaign.address, tranche.index, hash, uri));
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Evidence could not be prepared.');
    } finally { setBusy(false); }
  }

  if (loading) return <StateCard title="Loading verified campaign state…" />;
  if (error || !campaign) return <StateCard title="Campaign unavailable" detail={error} />;

  const now = Math.floor(Date.now() / 1000);
  const isCreator = wallet === campaign.creator;
  const canPledge = Boolean(wallet && campaign.status === 'Funding' && now < campaign.fundingDeadline);
  const canFinalizeFunding = Boolean(wallet && campaign.status === 'Funding' && now >= campaign.fundingDeadline && config);
  const availableRefund = campaign.refundPool > campaign.refundsPaid ? campaign.refundPool - campaign.refundsPaid : 0n;
  const estimatedFee = campaign.status === 'Funding' ? campaign.raised * 100n / 10_000n : campaign.feePaid;
  const paid = tranches.reduce((sum, tranche) => sum + (tranche.settled ? campaign.trancheAmounts[tranche.index]! : 0n), 0n);
  const progress = campaign.goal > 0n ? Math.min(100, Number(campaign.raised * 100n / campaign.goal)) : 0;
  const title = content?.title ?? `Campaign ${campaign.campaignId}`;

  return (
    <section aria-labelledby="campaign-title" className="space-y-8">
      <Link href="/discover" className="text-sm font-semibold underline">← All startups</Link>
      <div className="grid gap-8 lg:grid-cols-[1.25fr_.75fr]">
        <div>
          <div className="rounded-3xl bg-gradient-to-br from-emerald-100 via-sky-100 to-orange-100 p-8">
            <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-800">{campaign.status} · V2 Devnet</p>
            <h1 id="campaign-title" className="display-font mt-4 break-words text-5xl font-semibold md:text-6xl">{title}</h1>
            {content ? <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-700">{content.description}</p> : null}
            {termsError ? <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800" role="alert"><strong>Canonical terms not verified.</strong> {termsError} Financial actions still use on-chain state; unverified descriptive text is hidden.</p> : null}
          </div>
          <p className="mt-4 break-all font-mono text-xs text-slate-500">{campaign.address}</p>
        </div>

        <aside className="h-fit space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
          <div><p className="text-sm text-slate-500">Gross raised</p><p className="mt-1 text-4xl font-semibold">{formatSolV2(campaign.raised)} SOL</p><p className="mt-1 text-sm text-slate-500">of {formatSolV2(campaign.goal)} SOL goal{campaign.raised > campaign.goal ? ` · ${formatSolV2(campaign.raised - campaign.goal)} SOL overfunded` : ''}</p></div>
          <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded-full bg-emerald-600" style={{ width: `${progress}%` }} /></div>
          {campaign.status === 'Funding' ? <p className="text-xs text-slate-500">Funding closes <Time value={campaign.fundingDeadline} /></p> : null}
          {canPledge ? <form className="space-y-2" onSubmit={(event) => {
            event.preventDefault();
            try {
              const amount = parseSolV2(pledgeAmount);
              queue('Pledge to this campaign', [
                `From / fee payer: ${wallet}`,
                `Campaign vault: ${campaign.address}`,
                `Amount: ${formatSolV2(amount)} SOL`,
                'Cluster: Devnet',
                'State change: increases your cancellable pledge and campaign gross raised.',
              ], () => pledgeV2Ix(wallet!, campaign.address, amount));
            } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Invalid pledge amount.'); }
          }}><label className="block text-sm font-medium">Pledge amount (SOL)<input className="field" value={pledgeAmount} onChange={(event) => setPledgeAmount(event.target.value)} inputMode="decimal" required /></label><button className="action-primary" type="submit">Review pledge</button></form> : null}
          {!wallet ? <p className="rounded-xl bg-slate-100 p-3 text-sm">Connect a wallet to see eligible actions.</p> : null}
          {wallet && campaign.status === 'Funding' && now >= campaign.fundingDeadline && !config ? <p className="text-sm text-red-700">Protocol config is unavailable; funding cannot be safely finalized.</p> : null}
          {canFinalizeFunding ? <ActionButton onClick={() => queue('Finalize funding', [`Caller / fee payer: ${wallet}`, `Treasury: ${config!.treasury}`, `Gross raised: ${formatSolV2(campaign.raised)} SOL`, `Success fee if goal met: ${formatSolV2(estimatedFee)} SOL`, 'Cluster: Devnet', 'State change: marks the campaign Failed or Succeeded and transfers the configured fee only on success.'], () => finalizeFundingV2Ix(wallet!, campaign.address, config!.treasury))}>Review permissionless finalization</ActionButton> : null}
          {ledger && campaign.status === 'Funding' && now < campaign.fundingDeadline ? <ActionButton onClick={() => queue('Cancel full pledge', [`Backer / recipient: ${wallet}`, `Amount returned: ${formatSolV2(ledger.amount)} SOL plus ledger rent`, 'Cluster: Devnet', 'State change: closes your ledger and reduces gross raised.'], () => cancelPledgeV2Ix(wallet!, campaign.address))}>Review pledge cancellation</ActionButton> : null}
          {ledger && campaign.status === 'Failed' && wallet ? <ActionButton onClick={() => queue('Claim failed-goal refund', [`Caller / fee payer: ${wallet}`, `Refund recipient: ${ledger.backer}`, `Amount: ${formatSolV2(ledger.amount)} SOL plus ledger rent`, 'Cluster: Devnet', 'State change: closes this backer ledger.'], () => claimRefundV2Ix(wallet, campaign.address, ledger.backer))}>Review full refund</ActionButton> : null}
          {ledger && campaign.status === 'Terminated' && wallet ? <ActionButton onClick={() => queue('Claim pro-rata termination refund', [`Caller / fee payer: ${wallet}`, `Refund recipient: ${ledger.backer}`, `Estimated share: ${formatSolV2(campaign.finalRaised > 0n ? ledger.amount * campaign.refundPool / campaign.finalRaised : 0n)} SOL`, `Remaining campaign refund pool: ${formatSolV2(availableRefund)} SOL`, 'Cluster: Devnet', 'State change: closes this backer ledger after paying its pro-rata share.'], () => claimTerminationRefundV2Ix(wallet, campaign.address, ledger.backer))}>Review termination refund</ActionButton> : null}
        </aside>
      </div>

      <section aria-labelledby="accounting-title"><h2 id="accounting-title" className="text-2xl font-semibold">On-chain accounting</h2><dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Success fee" value={`${formatSolV2(estimatedFee)} SOL`} /><Metric label="Net milestone budget" value={`${formatSolV2(campaign.netBudget)} SOL`} /><Metric label="Paid to recipients" value={`${formatSolV2(paid)} SOL`} /><Metric label="Reserved claims" value={`${formatSolV2(campaign.reserved)} SOL`} /><Metric label="Refund pool" value={`${formatSolV2(campaign.refundPool)} SOL`} /><Metric label="Refunds paid" value={`${formatSolV2(campaign.refundsPaid)} SOL`} /><Metric label="Available refunds" value={`${formatSolV2(availableRefund)} SOL`} /><Metric label="Creator deposit" value="0 SOL" /></dl></section>

      {campaign.status === 'Succeeded' && isCreator ? <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-semibold">Creator termination preparation</h2><p className="mt-2 text-sm leading-6 text-slate-600">Returning SOL is optional and happens before termination, increasing the unreserved pro-rata refund pool. It does not reduce already approved reserved claims.</p><form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); try { const amount = parseSolV2(returnAmount); queue('Return creator funds', [`From / fee payer: ${wallet}`, `Campaign vault: ${campaign.address}`, `Amount: ${formatSolV2(amount)} SOL`, 'Cluster: Devnet', 'State change: adds SOL to the vault before termination.'], () => returnFundsV2Ix(wallet!, campaign.address, amount)); } catch (reason) { setStatus(reason instanceof Error ? reason.message : 'Invalid amount.'); } }}><input className="field max-w-52" value={returnAmount} onChange={(event) => setReturnAmount(event.target.value)} inputMode="decimal" placeholder="SOL to return" /><button className="action-secondary" type="submit">Review return</button></form></section> : null}

      <section aria-labelledby="milestones-title"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Strictly ordered</p><h2 id="milestones-title" className="mt-2 text-3xl font-semibold">Milestones</h2></div><p className="text-sm text-slate-600">Approval requires &gt;50% of all {formatSolV2(campaign.finalRaised)} SOL final weight.</p></div>
        <div className="mt-5 space-y-4">{tranches.map((tranche) => {
          const claim = claims[tranche.index];
          const isCurrent = tranche.index === campaign.currentTranche;
          const denominator = campaign.finalRaised;
          const approval = denominator > 0n ? Number(tranche.approveWeight * 10_000n / denominator) / 100 : 0;
          const canSubmitEvidence = Boolean(isCreator && isCurrent && tranche.index > 0 && campaign.status === 'Succeeded' && ((tranche.status === 'Pending' && now < campaign.proofDeadline) || (tranche.status === 'Revision' && now < tranche.revisionEnd)));
          const canVote = Boolean(wallet && ledger && isCurrent && tranche.status === 'Voting' && now >= tranche.voteStart && now < tranche.voteEnd && !voted[tranche.index]);
          const canFinalizeVote = Boolean(wallet && isCurrent && tranche.status === 'Voting' && now >= tranche.voteEnd);
          const proofTimeout = tranche.status === 'Pending' ? campaign.proofDeadline : tranche.revisionEnd;
          const canTimeout = Boolean(wallet && isCurrent && tranche.index > 0 && campaign.status === 'Succeeded' && (tranche.status === 'Pending' || (tranche.status === 'Revision' && !tranche.evidenceUri)) && now >= proofTimeout);
          const canRelease = Boolean(wallet && !tranche.claimCreated && (campaign.status === 'Succeeded' || campaign.status === 'Terminated') && (tranche.index === 0 || tranche.status === 'Approved'));
          const canWithdraw = Boolean(wallet && claim && !tranche.settled && claim.claimed < claim.total && tranche.status === 'Approved');
          const canTerminate = Boolean(wallet && campaign.status === 'Succeeded' && (isCreator || (isCurrent && tranche.status === 'Rejected')));
          return <article key={tranche.address} className={`rounded-2xl border bg-white p-5 ${isCurrent ? 'border-emerald-500' : 'border-slate-200'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-emerald-700">{tranche.index === 0 ? 'Initial' : `Milestone ${tranche.index + 1}`} · {tranche.shareBps / 100}%</p><h3 className="mt-2 text-xl font-semibold">{content?.milestones?.[tranche.index]?.title ?? `Milestone ${tranche.index + 1}`}</h3></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{tranche.status}{tranche.settled ? ' · paid' : ''}</span></div>
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><Metric label="Net allocation" value={`${formatSolV2(campaign.trancheAmounts[tranche.index] ?? 0n)} SOL`} /><Metric label="Yes / all weight" value={`${formatSolV2(tranche.approveWeight)} / ${formatSolV2(denominator)} SOL`} /><Metric label="Approval" value={`${approval.toFixed(2)}%${approval === 50 ? ' · not enough' : ''}`} /></dl>
            {tranche.index > 0 ? <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3"><span>Proof due: <Time value={isCurrent ? campaign.proofDeadline : 0} /></span><span>Vote: <Time value={tranche.voteStart} /> → <Time value={tranche.voteEnd} /></span><span>Revision ends: <Time value={tranche.revisionEnd} /></span></div> : null}
            {tranche.evidenceUri ? <p className="mt-4 break-all text-sm"><a className="text-emerald-800 underline" href={arweaveGatewayUrl(tranche.evidenceUri)} target="_blank" rel="noreferrer">Open permanent evidence</a></p> : null}
            <div className="mt-5 flex flex-wrap gap-2">
              {canVote ? <><ActionButton onClick={() => queue('Vote yes', [`Backer / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}, round ${tranche.round}`, `Voting weight: ${formatSolV2(ledger!.amount)} SOL`, `Denominator: ${formatSolV2(campaign.finalRaised)} SOL`, 'State change: records one immutable vote for this round.'], () => voteMilestoneV2Ix(wallet!, campaign.address, tranche, true))}>Review YES vote</ActionButton><ActionButton onClick={() => queue('Vote no', [`Backer / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}, round ${tranche.round}`, `Voting weight: ${formatSolV2(ledger!.amount)} SOL`, `Denominator: ${formatSolV2(campaign.finalRaised)} SOL`, 'State change: records one immutable vote for this round.'], () => voteMilestoneV2Ix(wallet!, campaign.address, tranche, false))}>Review NO vote</ActionButton></> : null}
              {canFinalizeVote ? <ActionButton onClick={() => queue('Finalize milestone vote', [`Caller / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}, round ${tranche.round}`, `Yes: ${formatSolV2(tranche.approveWeight)} of ${formatSolV2(campaign.finalRaised)} SOL`, 'State change: approves only if YES is strictly above 50%; otherwise opens revision or rejects after round two.'], () => finalizeVoteV2Ix(wallet!, campaign.address, tranche.index))}>Review vote finalization</ActionButton> : null}
              {canTimeout ? <ActionButton onClick={() => queue('Finalize missed proof deadline', [`Caller / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}`, `Expired deadline: ${new Date(proofTimeout * 1000).toISOString()}`, 'State change: marks the milestone rejected, enabling permissionless termination.'], () => finalizeProofTimeoutV2Ix(wallet!, campaign.address, tranche.index))}>Review proof timeout</ActionButton> : null}
              {canRelease ? <ActionButton onClick={() => queue('Create one-time tranche claim', [`Caller / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}`, `Claim total: ${formatSolV2(campaign.trancheAmounts[tranche.index] ?? 0n)} SOL`, `Recipients: ${tranche.recipients.join(', ')}`, 'State change: reserves a durable, one-time claim; this step does not yet transfer recipients’ SOL.'], () => releaseTrancheV2Ix(wallet!, campaign.address, tranche.index))}>Review permissionless release</ActionButton> : null}
              {canWithdraw ? <ActionButton onClick={() => queue('Pay tranche recipients', [`Caller / fee payer: ${wallet}`, `Milestone: ${tranche.index + 1}`, `Total payout: ${formatSolV2(claim!.total)} SOL`, ...tranche.recipients.map((recipient, index) => `Recipient ${index + 1}: ${recipient} · ${tranche.recipientSharesBps[index]! / 100}%`), 'State change: transfers the split exactly once and marks the tranche settled.'], () => withdrawClaimV2Ix(wallet!, campaign.address, tranche))}>Review split payout</ActionButton> : null}
              {canTerminate ? <ActionButton onClick={() => queue('Terminate campaign', [`Caller / fee payer: ${wallet}`, `Campaign: ${campaign.address}`, `Reserved approved claims kept: ${formatSolV2(campaign.reserved)} SOL`, 'State change: freezes a pro-rata refund pool from remaining unreserved SOL.'], () => terminateV2Ix(wallet!, campaign.address, tranche.index))}>Review termination</ActionButton> : null}
            </div>
            {canSubmitEvidence ? <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void queueEvidence(tranche); }}><label className="sr-only" htmlFor={`evidence-${tranche.index}`}>Permanent evidence URI</label><input id={`evidence-${tranche.index}`} className="field flex-1 font-mono text-xs" placeholder="ar:// evidence manifest" value={evidenceUris[tranche.index] ?? ''} onChange={(event) => setEvidenceUris((current) => ({ ...current, [tranche.index]: event.target.value }))} required /><button className="action-secondary" disabled={busy} type="submit">Verify & review evidence</button></form> : null}
          </article>;
        })}</div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6"><h2 className="text-xl font-semibold">Canonical campaign terms</h2>{terms ? <><p className="mt-3 text-sm leading-6 text-slate-600">Verified against the SHA-256 commitment stored in CampaignV2. The URL is a locator; the permanent manifest is the source of descriptive content.</p><a className="mt-3 inline-block break-all font-mono text-xs text-emerald-800 underline" href={arweaveGatewayUrl(campaign.termsUri)} target="_blank" rel="noreferrer">{campaign.termsUri}</a></> : <p className="mt-3 text-sm text-slate-600">{campaign.status === 'Draft' ? 'Draft terms are not sealed and contributions are disabled.' : termsError}</p>}</section>

      {review ? <section className="sticky bottom-4 z-10 rounded-2xl border-2 border-amber-500 bg-amber-50 p-5 shadow-xl" aria-labelledby="transaction-review-title"><h2 id="transaction-review-title" className="text-xl font-semibold">{review.title}</h2><ul className="mt-3 space-y-1 text-sm">{review.details.map((detail) => <li key={detail} className="break-all">{detail}</li>)}</ul><p className="mt-3 text-xs font-semibold">The exact transaction will be simulated before the wallet approval opens.</p><div className="mt-4 flex gap-2"><button className="action-primary" disabled={busy} onClick={() => void submitReview()}>{busy ? 'Simulating…' : 'Simulate & approve once'}</button><button className="action-secondary" disabled={busy} onClick={() => setReview(null)}>Cancel</button></div></section> : null}
      {status ? <p className="break-words rounded-xl bg-slate-100 p-4 text-sm" role="status" aria-live="polite">{status.startsWith('Confirmed: http') || status.startsWith('Submitted but') ? <a className="underline" href={status.slice(status.indexOf('http'))} target="_blank" rel="noreferrer">{status}</a> : status}</p> : null}
    </section>
  );
}

function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) { return <button type="button" className="action-secondary" onClick={onClick}>{children}</button>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words font-semibold">{value}</dd></div>; }
function Time({ value }: { value: number }) { return value > 0 ? <time dateTime={new Date(value * 1000).toISOString()}>{new Date(value * 1000).toLocaleString()}</time> : <span>not started</span>; }
function StateCard({ title, detail = '' }: { title: string; detail?: string }) { return <section className="rounded-2xl bg-slate-100 p-8"><h1 className="text-2xl font-semibold">{title}</h1>{detail ? <p className="mt-3 text-sm text-slate-600">{detail}</p> : null}<Link href="/discover" className="mt-5 inline-block text-sm font-semibold underline">Back to discovery</Link></section>; }
