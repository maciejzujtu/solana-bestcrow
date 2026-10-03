import { FrontendConfig } from "@/config/FrontendConfig";
import { HomePageModel } from "@/models/HomePageModel";
import { BackendApiClient } from "@/services/BackendApiClient";
import { CampaignLookup } from "@/components/CampaignLookup";
import { BackendStatus } from "@/components/BackendStatus";
import { CreateCampaignForm } from "@/components/CreateCampaignForm";
import { WalletContext } from "@/components/WalletContext";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const config = FrontendConfig.fromEnv();
  const model = await HomePageModel.load(new BackendApiClient(config));

  return (
    <main className="shell">
      <div className="card">
        <p className="eyebrow">Bestcrow v2 prototype</p>
        <h1>Milestone crowdfunding on Solana</h1>
        <p className="intro">Create a USDC campaign, receive pledges and unlock milestones through backer voting.</p>
        <BackendStatus initialOnline={model.backendOnline} />
        <WalletContext>
          <CreateCampaignForm />
          <CampaignLookup />
        </WalletContext>
      </div>
    </main>
  );
}
