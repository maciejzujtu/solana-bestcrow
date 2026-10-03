import assert from "node:assert/strict";
import test from "node:test";
import { CampaignStatus, MilestoneStatus, type Campaign } from "@bestcrow/client";
import { decideAction } from "../src/keeper.js";
import type { CampaignRecord } from "../src/chain.js";

function record(status: CampaignStatus, milestoneStatus = MilestoneStatus.Reviewing): CampaignRecord {
  return {
    address: "campaign",
    account: {
      status,
      fundingDeadline: 100n,
      totalRaised: 50n,
      goal: 100n,
      currentMilestone: 0,
      milestones: [{ status: milestoneStatus, dueAt: 110n, voteDeadline: 300n }],
    } as unknown as Campaign,
  };
}

test("funding below goal expires at deadline", () => {
  assert.equal(decideAction(record(CampaignStatus.Funding), 99), null);
  assert.equal(decideAction(record(CampaignStatus.Funding), 100)?.kind, "finalize_funding");
});

test("missed evidence terminates the campaign", () => {
  assert.equal(decideAction(record(CampaignStatus.Active, MilestoneStatus.Pending), 111)?.kind, "expire_milestone");
});

test("backer vote resolves only when voting ends", () => {
  assert.equal(decideAction(record(CampaignStatus.Active), 299), null);
  assert.equal(decideAction(record(CampaignStatus.Active), 300)?.kind, "resolve_milestone");
});

test("finished campaign has no keeper action", () => {
  assert.equal(decideAction(record(CampaignStatus.Completed), 301), null);
});
