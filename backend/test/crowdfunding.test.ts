import assert from "node:assert/strict";
import test from "node:test";
import { BackendConfig } from "../src/config.js";
import { SolanaGateway } from "../src/chain.js";
import { CrowdfundingService, usdcUnits, type CreateRequest } from "../src/crowdfunding.js";

const creator = "11111111111111111111111111111111";
const quoteMint = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const config = BackendConfig.fromEnv({});
const service = new CrowdfundingService(config, new SolanaGateway(config));

function request(): CreateRequest {
  return {
    creator, campaignId: "1", quoteMint, goal: "100", initialRelease: "20",
    fundingDeadline: Math.floor(Date.now() / 1000) + 3600,
    voteDurationSecs: 60,
    metadataHash: "01".repeat(32),
    milestones: Array.from({ length: 5 }, (_, index) => ({
      amount: "16",
      dueAt: Math.floor(Date.now() / 1000) + 7200 + index * 3600,
    })),
  };
}

test("USDC amounts convert without floating point rounding", () => {
  assert.equal(usdcUnits("1.000001"), 1_000_001n);
  assert.throws(() => usdcUnits("1.0000001"), /six decimal/);
  assert.throws(() => usdcUnits("0"), /outside/);
});

test("campaign preparation needs no market accounts and derives a stable PDA", () => {
  const result = service.prepareCreate(request());
  assert.equal(result.instructions.length, 1);
  assert.equal(result.instructions[0]?.programId, config.stagegateProgramId);
  assert.equal(result.instructions[0]?.accounts.length, 8);
  assert.equal(result.campaign, service.prepareCreate(request()).campaign);
});

test("invalid allocations and short milestone schedules are rejected", () => {
  const invalid = request();
  invalid.milestones[0].amount = "17";
  assert.throws(() => service.prepareCreate(invalid), /sum to the goal/);
  invalid.milestones[0].amount = "16";
  invalid.milestones[0].dueAt = invalid.fundingDeadline + invalid.voteDurationSecs;
  assert.throws(() => service.prepareCreate(invalid), /full voting period/);
});
