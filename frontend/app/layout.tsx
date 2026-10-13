import type { Metadata } from 'next';
import Link from 'next/link';

import './globals.css';
import { Providers } from './providers';
import WalletControls from './wallet-controls';

export const metadata: Metadata = {
  title: 'Bestcrow — startup funding without intermediaries',
  description: 'Milestone funding for startups with transparent on-chain rules.',
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-950">
        <Providers>
        <header className="border-b border-slate-200">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4" aria-label="Main navigation">
            <div className="flex flex-wrap items-center gap-4">
              <Link href="/" className="brand-mark">BESTCROW</Link>
              <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                <Link href="/discover" className="hover:underline">Discover</Link>
                <Link href="/how-it-works" className="hover:underline">How it works</Link>
                <Link href="/my-contributions" className="hover:underline">My support</Link>
                <Link href="/profile" className="hover:underline">Profile</Link>
              </div>
            </div>
            <WalletControls />
          </nav>
        </header>
        <main className="mx-auto min-h-[calc(100vh-7rem)] max-w-5xl px-6 py-12">{children}</main>
        <footer className="border-t border-slate-200 px-6 py-4 text-sm text-slate-600">
          <div className="mx-auto flex max-w-5xl flex-wrap justify-between gap-x-4 gap-y-1"><span>BESTCROW</span><span>1% fee only when a campaign succeeds · Devnet</span></div>
        </footer>
        </Providers>
      </body>
    </html>
  );
}
