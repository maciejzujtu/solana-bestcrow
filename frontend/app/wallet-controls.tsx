'use client';

import { useEffect, useState } from 'react';
import {
  useConnectedWallet,
  useConnect,
  useDisconnect,
  useWalletStatus,
  useWallets,
} from '@solana/kit-plugin-wallet/react';
import { client } from './providers';
import {
  clearWalletSession,
  getWalletSession,
  walletFirstLogin,
  type WalletSession,
} from './lib/wallet-session';

function shortAddress(value: string): string {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

export default function WalletControls() {
  const [mounted, setMounted] = useState(false);
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const walletStatus = useWalletStatus(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [open, setOpen] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [session, setSession] = useState<WalletSession | null>(null);
  const connectedAddress = connected?.account.address;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const refresh = () => setSession(connectedAddress ? getWalletSession(connectedAddress) : null);
    refresh();
    window.addEventListener('bestcrow:session', refresh);
    return () => window.removeEventListener('bestcrow:session', refresh);
  }, [connectedAddress]);

  async function signIn(address: string): Promise<void> {
    setLoginBusy(true);
    setStatus('Approve the ownership message in your wallet. It cannot move funds.');
    try {
      await walletFirstLogin(address);
      setStatus('Wallet connected and signed in.');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Could not sign in with the wallet.');
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleConnect(wallet: (typeof wallets)[number]): Promise<void> {
    setStatus('');
    setOpen(false);
    setLoginBusy(true);
    try {
      const accounts = await connect.dispatchAsync(wallet);
      const active = client.wallet.getState().connected?.account.address ?? accounts[0]?.address;
      if (!active) throw new Error('Wallet connected without an active account.');
      await walletFirstLogin(active);
      setStatus('Wallet connected and signed in.');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Could not connect or sign in with the wallet.');
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleDisconnect(): Promise<void> {
    setStatus('Disconnecting wallet…');
    try {
      await clearWalletSession();
      await disconnect.dispatchAsync();
      setStatus('Wallet disconnected.');
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : 'Could not disconnect wallet.');
    }
  }

  if (!mounted || walletStatus === 'pending' || walletStatus === 'reconnecting') {
    return <span className="text-sm text-slate-600" role="status">Reconnecting wallet…</span>;
  }

  if (connected && connectedAddress) {
    const signedIn = session?.wallet === connectedAddress;
    return (
      <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
        <span className="max-w-32 truncate" title={connectedAddress}>{shortAddress(connectedAddress)}</span>
        {signedIn ? null : (
          <button
            type="button"
            className="border border-slate-900 px-2 py-1 hover:bg-slate-900 hover:text-white disabled:opacity-50"
            disabled={loginBusy}
            onClick={() => void signIn(connectedAddress)}
          >
            {loginBusy ? 'Signing in…' : 'Sign in'}
          </button>
        )}
        <button
          type="button"
          className="border border-slate-300 px-2 py-1 hover:bg-slate-50 disabled:opacity-50"
          disabled={disconnect.isRunning || loginBusy}
          onClick={() => void handleDisconnect()}
        >
          Disconnect
        </button>
        {status ? <span className="max-w-64 text-xs text-slate-600" role="status">{status}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="border border-slate-900 px-3 py-2 text-sm hover:bg-slate-900 hover:text-white disabled:opacity-50"
        disabled={connect.isRunning || loginBusy}
        aria-expanded={open}
        onClick={() => { setStatus(''); setOpen((value) => !value); }}
      >
        {connect.isRunning || loginBusy ? 'Connecting…' : 'Connect wallet'}
      </button>
      {open ? (
        <div className="absolute right-0 z-10 mt-2 w-64 border border-slate-200 bg-white p-2 shadow-sm" role="menu">
          {wallets.length === 0 ? <p className="p-2 text-sm text-slate-600">No compatible wallet detected.</p> : null}
          {wallets.map((wallet) => (
            <button
              key={wallet.name}
              type="button"
              className="block w-full px-2 py-2 text-left text-sm hover:bg-slate-50"
              role="menuitem"
              disabled={loginBusy}
              onClick={() => void handleConnect(wallet)}
            >
              {wallet.name}
            </button>
          ))}
          {status ? <p className="p-2 text-xs text-slate-700" role="status">{status}</p> : null}
        </div>
      ) : null}
      {!open && status ? <p className="absolute right-0 mt-2 w-64 rounded border border-slate-200 bg-white p-2 text-xs text-slate-700 shadow-sm" role="status">{status}</p> : null}
    </div>
  );
}
