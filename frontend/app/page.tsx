import Link from 'next/link';
import CampaignList from './discover/campaign-list';

export default function HomePage() {
  return (
    <section className="space-y-16" aria-labelledby="home-title">
      <div className="grid gap-10 py-10 md:grid-cols-[1.35fr_.65fr] md:items-end">
        <div>
          <p className="mb-5 text-xs font-bold uppercase tracking-[.22em] text-emerald-700">Transparent funding for early-stage teams</p>
          <h1 id="home-title" className="display-font max-w-3xl text-6xl font-semibold md:text-8xl">Back the next<br />milestone.</h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-slate-600">Bestcrow helps startup teams fund prototypes against a public plan. A successful raise unlocks an initial tranche; supporters vote before later releases. Devnet uses test SOL, and mock mode moves no SOL.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link className="rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700" href="/discover">Explore startups</Link><Link className="rounded-full border border-slate-300 px-6 py-3 text-sm font-semibold hover:border-slate-950" href="/campaign/new">Start a campaign</Link></div>
        </div>
        <div className="rounded-3xl bg-emerald-200 p-7"><p className="text-sm font-semibold">Protocol snapshot</p><div className="mt-8 grid grid-cols-2 gap-6"><Stat value="2–5" label="milestones" /><Stat value="7 days" label="every vote" /><Stat value="1%" label="success fee" /><Stat value="0 SOL" label="creator deposit" /></div></div>
      </div>
      <div><div className="mb-5 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.18em] text-slate-500">Choose mock or Devnet above</p><h2 className="mt-2 text-3xl font-semibold">Startup campaigns</h2></div><Link className="text-sm font-semibold underline" href="/discover">Explore campaigns</Link></div><CampaignList /></div>
    </section>
  );
}

function Stat({ value, label }: { value: string; label: string }) { return <div><p className="text-2xl font-semibold">{value}</p><p className="mt-1 text-xs text-slate-600">{label}</p></div>; }
