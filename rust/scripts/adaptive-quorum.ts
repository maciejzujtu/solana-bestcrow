export interface QuorumConfig {
  quorumBps: number;          // e.g. 2500 = 25.00% of total campaign raised funds
  supermajorityBps: number;   // e.g. 6667 = 66.67% of cast votes
}

export const DEFAULT_ADAPTIVE_QUORUM: QuorumConfig = {
  quorumBps: 2500,
  supermajorityBps: 6667,
};

export interface QuorumEvaluation {
  totalRaised: bigint;
  yesWeight: bigint;
  noWeight: bigint;
  totalVotesCast: bigint;
  quorumThresholdLamports: bigint;
  quorumReached: boolean;
  approvalBps: number;
  supermajorityReached: boolean;
  outcome: 'APPROVED' | 'REJECTED_QUORUM' | 'REJECTED_VOTE';
  absoluteMajorityApproved: boolean; // For comparison with strict legacy rule
}

/**
 * Evaluates whether a milestone vote succeeds under the Adaptive Quorum + Supermajority model.
 *
 * Prevents "apathy deadlock": when inactive backers fail to vote, a campaign with strong
 * backer support (e.g. 40% Yes, 0% No) is not unfairly terminated by non-participating accounts.
 */
export function evaluateAdaptiveQuorum(
  totalRaised: bigint,
  yesWeight: bigint,
  noWeight: bigint,
  config: QuorumConfig = DEFAULT_ADAPTIVE_QUORUM,
): QuorumEvaluation {
  if (totalRaised <= 0n) {
    throw new Error('Total raised lamports must be positive');
  }

  const totalVotesCast = yesWeight + noWeight;
  const quorumThresholdLamports = (totalRaised * BigInt(config.quorumBps)) / 10000n;
  const quorumReached = totalVotesCast >= quorumThresholdLamports;

  let approvalBps = 0;
  if (totalVotesCast > 0n) {
    approvalBps = Number((yesWeight * 10000n) / totalVotesCast);
  }

  const supermajorityReached = approvalBps >= config.supermajorityBps;
  const absoluteMajorityApproved = yesWeight * 2n > totalRaised;

  let outcome: 'APPROVED' | 'REJECTED_QUORUM' | 'REJECTED_VOTE';
  if (!quorumReached) {
    outcome = 'REJECTED_QUORUM';
  } else if (!supermajorityReached) {
    outcome = 'REJECTED_VOTE';
  } else {
    outcome = 'APPROVED';
  }

  return {
    totalRaised,
    yesWeight,
    noWeight,
    totalVotesCast,
    quorumThresholdLamports,
    quorumReached,
    approvalBps,
    supermajorityReached,
    outcome,
    absoluteMajorityApproved,
  };
}
