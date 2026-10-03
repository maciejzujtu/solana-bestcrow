import Link from "next/link";
import { CampaignPanel } from "@/components/CampaignPanel";
import { WalletContext } from "@/components/WalletContext";

export default async function CampaignPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  return (
    <main className="campaign-shell">
      <Link href="/" className="back-link">← Bestcrow</Link>
      <WalletContext><CampaignPanel address={address} /></WalletContext>
    </main>
  );
}
