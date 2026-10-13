import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How it works | Charity Vault' };

export default function HowItWorksPage() {
  return (
    <section aria-labelledby="how-it-works-title">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">A fairer funding loop</p><h1 id="how-it-works-title" className="display-font mt-3 text-5xl font-semibold">Rules before promises.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Every campaign publishes its terms before the first contribution. The contract, not a platform moderator, holds the money and enforces the sequence.</p>
      <div className="mt-12 grid gap-5 md:grid-cols-3">{[['01','Lock the plan','Creators publish 2–5 milestones, a 7–183 day funding window and the full split. Terms cannot change after funding starts.'],['02','Back the work','Contributions can exceed the goal. A 1% fee is taken only once, and only when the goal succeeds.'],['03','Vote on proof','Backers get a fixed seven-day vote. More than half of the final raised amount must vote yes to release a milestone.']].map(([n,t,d])=><article key={n} className="rounded-2xl bg-white p-6"><span className="text-sm font-bold text-emerald-700">{n}</span><h2 className="mt-12 text-xl font-semibold">{t}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{d}</p></article>)}</div>
      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950"><strong>Network costs are separate.</strong> Wallets pay their own Solana transaction fees. Bestcrow does not charge a creator deposit in the MVP.</div>
    </section>
  );
}
