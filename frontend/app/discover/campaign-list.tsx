'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { client } from '../providers';
import {
  fetchCampaignContentV2,
  fetchVerifiedTermsV2,
  formatSolV2,
  getCampaignsV2,
  DEVNET_MOCK_MODE,
  type CampaignContentV2,
  type CampaignV2,
  type FundingStatusV2,
} from '../lib/charity-vault-v2';
import { getMockCampaignsV2 } from '../lib/mock-campaigns-v2';

type ListedCampaign = { campaign: CampaignV2; content: CampaignContentV2 | null; verified: boolean };
const phases: Array<'All' | Exclude<FundingStatusV2, 'Draft'>> = ['All', 'Funding', 'Succeeded', 'Failed', 'Completed', 'Terminated'];

export default function CampaignList() {
  const [items, setItems] = useState<ListedCampaign[]>([]);
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<(typeof phases)[number]>('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const campaigns = (await getCampaignsV2(client)).filter((campaign) => campaign.status !== 'Draft');
        const loaded = await Promise.all(campaigns.map(async (campaign): Promise<ListedCampaign> => {
          try {
            const terms = (await fetchVerifiedTermsV2(campaign)).terms;
            return { campaign, content: await fetchCampaignContentV2(terms), verified: true };
          }
          catch { return { campaign, content: null, verified: false }; }
        }));
        const mocks = DEVNET_MOCK_MODE
          ? getMockCampaignsV2().map(({ campaign, content }) => ({ campaign, content, verified: true }))
          : [];
        if (active) setItems([...mocks, ...loaded.filter(({ campaign }) => !mocks.some(({ campaign: mock }) => mock.address === campaign.address))]);
      } catch (reason) {
        if (active && DEVNET_MOCK_MODE) {
          setItems(getMockCampaignsV2().map(({ campaign, content }) => ({ campaign, content, verified: true })));
        } else if (active) setError(reason instanceof Error ? reason.message : 'Campaigns could not be loaded.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter(({ campaign, content }) => (phase === 'All' || campaign.status === phase) && (!needle ||
      campaign.address.toLowerCase().includes(needle) || campaign.creator.toLowerCase().includes(needle) || content?.title.toLowerCase().includes(needle)));
  }, [items, phase, query]);

  if (loading) return <p className="mt-10 rounded-2xl bg-slate-100 p-6 text-sm" role="status">Loading V2 campaigns from Devnet…</p>;
  if (error) return <p className="mt-10 rounded-2xl bg-red-50 p-6 text-sm text-red-800" role="alert">{error}</p>;

  return <>
    <div className="mt-8 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_auto]">
      <label className="text-sm font-medium">Search verified title, creator or address<input className="field" type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <label className="text-sm font-medium">Phase<select className="field min-w-40" value={phase} onChange={(event) => setPhase(event.target.value as (typeof phases)[number])}>{phases.map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    {filtered.length === 0 ? <p className="mt-8 rounded-2xl bg-slate-100 p-8 text-sm">No V2 campaigns match this view.</p> : <div className="mt-8 grid gap-5 md:grid-cols-2">{filtered.map(({ campaign, content, verified }) => {
      const progress = campaign.goal > 0n ? Number(campaign.raised * 100n / campaign.goal) : 0;
      return <Link key={campaign.address} href={`/campaign/${campaign.address}`} className="group rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-1 hover:shadow-lg">
        <div className="flex items-start justify-between gap-3"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-800">{campaign.status}</span><span className={`text-xs font-semibold ${verified ? 'text-emerald-700' : 'text-amber-700'}`}>{DEVNET_MOCK_MODE && getMockCampaignsV2().some(({ campaign: mock }) => mock.address === campaign.address) ? 'Devnet mock' : verified ? 'Terms verified' : 'Terms unavailable'}</span></div>
        <h2 className="mt-6 break-words text-2xl font-semibold">{content?.title ?? `Campaign ${campaign.campaignId}`}</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{content?.description ?? 'Descriptive content is hidden until its permanent manifest matches the on-chain hash.'}</p>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${Math.min(progress, 100)}%` }} /></div>
        <div className="mt-3 flex flex-wrap justify-between gap-2 text-sm"><span>{formatSolV2(campaign.raised)} SOL raised</span><span className="text-slate-500">{progress}% of {formatSolV2(campaign.goal)} SOL</span></div>
        <p className="mt-5 truncate font-mono text-xs text-slate-500" title={campaign.creator}>Creator {campaign.creator}</p>
        <span className="mt-5 inline-block text-sm font-semibold underline">View on-chain campaign →</span>
      </Link>;
    })}</div>}
  </>;
}
