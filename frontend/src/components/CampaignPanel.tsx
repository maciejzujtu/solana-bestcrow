"use client";

import { useCallback, useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { CampaignTransactionService } from "@/services/CampaignTransactionService";
import { CrowdfundingApiClient, type CampaignRecord, type PreparedCampaignTransaction, type SerializedInstruction } from "@/services/CrowdfundingApiClient";

const STATUS = ["Funding", "Active", "Failed", "Terminated", "Completed"];
const MILESTONE_STATUS = ["Pending", "Voting", "Passed", "Rejected"];

function usdc(value: string): string {
  const amount = BigInt(value);
  const whole = amount / 1_000_000n;
  const fraction = String(amount % 1_000_000n).padStart(6, "0").replace(/0+$/, "");
  return whole.toString() + (fraction ? "." + fraction : "") + " USDC";
}

function date(value: string): string {
  return new Date(Number(value) * 1000).toLocaleString();
}

async function hashEvidence(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value.trim()));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function CampaignPanel({ address }: { address: string }) {
  const { connection } = useConnection();
  const wallet = useWallet();
  const [record, setRecord] = useState<CampaignRecord | null>(null);
  const [amount, setAmount] = useState("");
  const [evidence, setEvidence] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const api = new CrowdfundingApiClient();

  const load = useCallback(async () => {
    try {
      const result = await new CrowdfundingApiClient().campaign(address);
      setRecord(result);
      setMessage("");
    } catch (error) {
      setRecord(null);
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [address]);

  useEffect(() => { void load(); }, [load]);

  async function send(instructions: SerializedInstruction[]) {
    if (!wallet.publicKey || !wallet.sendTransaction) throw new Error("Connect a wallet first");
    const service = new CampaignTransactionService(connection, wallet.publicKey, wallet.sendTransaction);
    setMessage("Simulating transaction. Confirm it in your wallet.");
    const signature = await service.execute(instructions);
    await load();
    setMessage("Transaction confirmed: " + signature);
  }

  async function run(operation: () => Promise<PreparedCampaignTransaction | { instruction: SerializedInstruction }>) {
    if (!wallet.publicKey) return setMessage("Connect a wallet first");
    setBusy(true);
    try {
      const prepared = await operation();
      await send("instructions" in prepared ? prepared.instructions : [prepared.instruction]);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function resolve() {
    if (!wallet.publicKey) return setMessage("Connect a wallet first");
    setBusy(true);
    try {
      const action = await api.action(address, wallet.publicKey.toBase58());
      if (!action.instructions) throw new Error("No milestone action is ready yet");
      await send(action.instructions);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (!record) {
    return <div className="campaign-card"><h1>Campaign</h1><p className="muted">Address: <code>{address}</code></p>
      <p role="status">{message || "Loading campaign..."}</p><button onClick={() => void load()}>Retry</button></div>;
  }
  const campaign = record.account;
  const walletAddress = wallet.publicKey?.toBase58();
  const milestone = campaign.milestones[campaign.currentMilestone];
  const isCreator = walletAddress === campaign.creator;
  const funding = campaign.status === 0;
  const active = campaign.status === 1;
  const refundable = campaign.status === 2 || campaign.status === 3;

  return (
    <div className="campaign-card">
      <div className="campaign-header"><div><p className="eyebrow">Bestcrow campaign</p><h1>{STATUS[campaign.status] || "Unknown state"}</h1></div><WalletMultiButton /></div>
      <p className="muted">Campaign address: <code>{record.address}</code></p>
      <div className="campaign-details">
        <span>Creator: <code>{campaign.creator}</code></span>
        <span>Raised: {usdc(campaign.totalRaised)} / {usdc(campaign.goal)}</span>
        <span>Escrow remaining: {usdc(campaign.escrowBalance)}</span>
        <span>Released: {usdc(campaign.totalReleased)}</span>
        <span>Funding deadline: {date(campaign.fundingDeadline)}</span>
        <span>Voting period: {campaign.voteDurationSecs} seconds</span>
      </div>
      {funding && <section className="section">
        <h2>Back this campaign</h2>
        <label className="field">USDC amount
          <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="10" />
        </label>
        <div className="button-row">
          <button disabled={busy || !walletAddress} onClick={() => void run(() => api.prepare(address, "pledge", { wallet: walletAddress, amount }))}>Pledge USDC</button>
          <button disabled={busy || !walletAddress} onClick={() => void run(() => api.prepare(address, "withdraw", { wallet: walletAddress, amount }))}>Withdraw pledge</button>
        </div>
        <p className="muted small">You may withdraw during funding. When the exact goal is reached, the kickoff payout is sent to the creator.</p>
      </section>}
      <section className="section"><h2>Milestones</h2>
        <ol className="milestone-list">{campaign.milestones.map((item, index) => (
          <li key={index}>
            <strong>Milestone {index + 1}: {usdc(item.amount)}</strong> — {MILESTONE_STATUS[item.status] || "Unknown"}
            <div className="muted small">Evidence due: {date(item.dueAt)}</div>
            {item.status !== 0 && <div className="muted small">Evidence hash: <code>{item.evidenceHash.map((byte) => byte.toString(16).padStart(2, "0")).join("")}</code></div>}
            {item.status === 1 && <div className="muted small">Voting closes: {date(item.voteDeadline)} · Yes: {usdc(item.yesVotes)} · No: {usdc(item.noVotes)}</div>}
          </li>
        ))}</ol>
      </section>
      {active && milestone?.status === 0 && isCreator && <section className="section">
        <h2>Submit evidence</h2>
        <label className="field">Public evidence link or text
          <input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="https://..." />
        </label>
        <p className="muted small">Only its SHA-256 hash is stored on chain. Publish the actual evidence so backers can inspect it.</p>
        <button disabled={busy || !evidence.trim()} onClick={() => void run(async () =>
          api.prepare(address, "evidence", { creator: walletAddress, evidenceHash: await hashEvidence(evidence) }))}>Open voting</button>
      </section>}
      {active && milestone?.status === 1 && <section className="section">
        <h2>Backer vote</h2>
        <p className="muted">One vote per backer. Your vote is weighted by your USDC contribution. More than 50% of all pledged USDC must approve.</p>
        <div className="button-row">
          <button disabled={busy || !walletAddress} onClick={() => void run(() => api.prepare(address, "vote", { wallet: walletAddress, approve: true }))}>Approve</button>
          <button disabled={busy || !walletAddress} onClick={() => void run(() => api.prepare(address, "vote", { wallet: walletAddress, approve: false }))}>Reject</button>
        </div>
      </section>}
      {(funding || active) && <section className="section">
        <h2>Advance campaign</h2>
        <p className="muted small">After a deadline, anyone can finalize failed funding, expire missing evidence or resolve a completed vote.</p>
        <button disabled={busy || !walletAddress} onClick={() => void resolve()}>Check and resolve</button>
      </section>}
      {refundable && <section className="section">
        <h2>Claim remaining USDC</h2>
        <p className="muted small">Refunds are proportional to contributions and cover only funds still in escrow.</p>
        <button disabled={busy || !walletAddress} onClick={() => void run(() => api.refund(address, walletAddress!))}>Claim refund</button>
      </section>}
      <div className="button-row"><button disabled={busy} onClick={() => void load()}>Refresh</button></div>
      {message && <p className="campaign-message" role="status">{message}</p>}
    </div>
  );
}
