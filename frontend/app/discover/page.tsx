import type { Metadata } from 'next';
import Link from 'next/link';
import CampaignList from './campaign-list';

export const metadata: Metadata = { title: 'Discover | Bestcrow' };

export default function DiscoverPage() {
  return (
    <section aria-labelledby="discover-title">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">The launch board</p><h1 id="discover-title" className="display-font mt-3 text-5xl font-semibold">Discover startups</h1><p className="mt-4 text-slate-600">Browse campaigns with public milestones, budgets and voting rules.</p></div><Link href="/campaign/new" className="rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white">Launch a project</Link></div>
      <CampaignList />
    </section>
  );
}
