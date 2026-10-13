import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'How it works | Bestcrow' };

export default function HowItWorksPage() {
  return (
    <section aria-labelledby="how-it-works-title">
      <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">Startup funding with public receipts</p><h1 id="how-it-works-title" className="display-font mt-3 text-5xl font-semibold">Fund progress, one milestone at a time.</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">Creators publish a goal and milestone budget before fundraising. Phantom signs actual Devnet transactions with test SOL; mock mode is only a browser simulation.</p>
      <div className="mt-12 grid gap-5 md:grid-cols-3">{[['01','Publish the plan','Choose 2–5 tranches and a 7–183 day funding window. Real Devnet campaigns need a publicly reachable terms document.'],['02','Support the prototype','Backers pledge test SOL on Devnet or try a clearly labeled mock pledge. A 1% platform fee applies only after a successful raise; network costs are separate.'],['03','Release or refund','The initial tranche can fund work. Backers vote on later milestones. If the goal is missed, they can claim their full contribution; termination after success refunds only available funds.']].map(([n,t,d])=><article key={n} className="rounded-2xl bg-white p-6"><span className="text-sm font-bold text-emerald-700">{n}</span><h2 className="mt-12 text-xl font-semibold">{t}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{d}</p></article>)}</div>
      <div className="mt-10 rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-950"><strong>Public chain, private rewards.</strong> Wallet addresses, contribution amounts and payouts are visible on Solana. Digital reward codes must be delivered off-chain. No SOL moves in mock mode.</div>
    </section>
  );
}
