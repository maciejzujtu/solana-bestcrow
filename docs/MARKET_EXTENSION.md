# Optional market extension boundary

Bestcrow's deployed ABI in this branch has no market accounts or MetaDAO calls. Its funding, voting, payouts and refunds must work without a market service. The backend's crowdfunding API and frontend campaign pages have no market package dependency.

A future optional market UI could consume public campaign addresses, milestone deadlines and evidence hashes as read-only context. It would run its own program, indexer and routes. The core campaign would still be resolved by backer votes.

If a future version should let market outcomes authorize escrow payouts, that is a different on-chain policy. It needs a new, explicit resolution mode in the campaign terms, binding and validation of external accounts, migration or a separate program version, and a new security review. The current program must not silently accept a market result as a vote.
