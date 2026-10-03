"use client";

import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState, type FormEvent } from "react";
import { CampaignTransactionService } from "@/services/CampaignTransactionService";
import { CrowdfundingApiClient } from "@/services/CrowdfundingApiClient";

type MilestoneDraft = { amount: string; due: string };
const DEVNET_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

function localDate(hoursFromNow: number): string {
  const date = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function CreateCampaignForm() {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [title, setTitle] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [goal, setGoal] = useState("100");
  const [initialRelease, setInitialRelease] = useState("20");
  const [fundingDeadline, setFundingDeadline] = useState("");
  const [voteDurationSecs, setVoteDurationSecs] = useState("86400");
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(
    Array.from({ length: 5 }, () => ({ amount: "16", due: "" })),
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState("");
  const [created, setCreated] = useState("");

  useEffect(() => {
    setCampaignId(String(Date.now()));
    setFundingDeadline(localDate(48));
    setMilestones(Array.from({ length: 5 }, (_, index) => ({ amount: "16", due: localDate(96 + index * 72) })));
  }, []);

  function editMilestone(index: number, field: keyof MilestoneDraft, value: string) {
    setMilestones((current) => current.map((item, position) => position === index ? { ...item, [field]: value } : item));
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!wallet.publicKey || !wallet.sendTransaction) return setMessage("Connect a wallet first.");
    if (!title.trim()) return setMessage("Enter a short public project title.");
    setBusy(true);
    setMessage("Preparing campaign...");
    try {
      const metadataHash = await sha256(title.trim());
      const api = new CrowdfundingApiClient();
      const prepared = await api.create({
        creator: wallet.publicKey.toBase58(),
        campaignId,
        quoteMint: process.env.NEXT_PUBLIC_USDC_MINT || DEVNET_USDC,
        goal, initialRelease,
        fundingDeadline: Math.floor(new Date(fundingDeadline).getTime() / 1000),
        voteDurationSecs: Number(voteDurationSecs),
        metadataHash,
        milestones: milestones.map((item) => ({
          amount: item.amount,
          dueAt: Math.floor(new Date(item.due).getTime() / 1000),
        })),
      });
      setPreview(prepared.campaign);
      setMessage("Simulating transaction. Your wallet will ask you to approve creation.");
      const transaction = new CampaignTransactionService(connection, wallet.publicKey, wallet.sendTransaction);
      const signature = await transaction.execute(prepared.instructions);
      setCreated(prepared.campaign);
      setMessage("Campaign created. Transaction: " + signature);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section">
      <h2>Create a campaign</h2>
      <p className="muted">USDC funding, five to ten milestones, one vote per backer per milestone. Votes are weighted by USDC pledged.</p>
      <p className="muted small">A real campaign requires this version of the Anchor program deployed to your wallet's Solana cluster. This repository does not include a verified deployment.</p>
      <WalletMultiButton />
      <form className="campaign-form" onSubmit={(event) => void create(event)}>
        <label className="field">Public project title
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
        </label>
        <p className="muted small">Only a SHA-256 hash of this title is stored on chain. Save and publish your project description separately.</p>
        <label className="field">Campaign ID (unique for your wallet)
          <input value={campaignId} onChange={(event) => setCampaignId(event.target.value)} inputMode="numeric" required />
        </label>
        <div className="form-grid">
          <label className="field">Goal (USDC)
            <input value={goal} onChange={(event) => setGoal(event.target.value)} inputMode="decimal" required />
          </label>
          <label className="field">Kickoff payout (USDC, max 30%)
            <input value={initialRelease} onChange={(event) => setInitialRelease(event.target.value)} inputMode="decimal" required />
          </label>
          <label className="field">Funding deadline
            <input type="datetime-local" value={fundingDeadline} onChange={(event) => setFundingDeadline(event.target.value)} required />
          </label>
          <label className="field">Voting period (seconds)
            <input value={voteDurationSecs} onChange={(event) => setVoteDurationSecs(event.target.value)} inputMode="numeric" required />
          </label>
        </div>
        <h3>Milestones</h3>
        <p className="muted small">Kickoff and milestone amounts must equal the goal. Each deadline must leave room for voting after the previous one.</p>
        {milestones.map((item, index) => (
          <div className="form-grid milestone-row" key={index}>
            <label className="field">Milestone {index + 1} payout (USDC)
              <input value={item.amount} onChange={(event) => editMilestone(index, "amount", event.target.value)} inputMode="decimal" required />
            </label>
            <label className="field">Evidence deadline
              <input type="datetime-local" value={item.due} onChange={(event) => editMilestone(index, "due", event.target.value)} required />
            </label>
          </div>
        ))}
        <div className="button-row">
          <button type="button" disabled={milestones.length >= 10} onClick={() => setMilestones((items) => [...items, { amount: "0", due: localDate(96 + items.length * 72) }])}>Add milestone</button>
          <button type="button" disabled={milestones.length <= 5} onClick={() => setMilestones((items) => items.slice(0, -1))}>Remove last</button>
        </div>
        <button className="primary" type="submit" disabled={busy || !wallet.publicKey}>Create campaign</button>
      </form>
      {message && <p className="campaign-message" role="status">{message}</p>}
      {preview && !created && <p className="muted small">Prepared address: <code>{preview}</code>. It is not an on-chain campaign until the transaction succeeds.</p>}
      {created && <p><Link href={"/campaign/" + created}>Open your campaign: <code>{created}</code></Link></p>}
    </section>
  );
}
