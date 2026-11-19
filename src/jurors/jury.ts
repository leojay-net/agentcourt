import type { NetworkProvider } from 'cashscript';
import { JUROR_QUORUM } from '../core/constants';
import type { CourtContract } from '../core/courtContract';
import { JuryQuorumError } from '../core/errors';
import { executeJuryRuling, type TransactionReceipt } from '../core/escrow';
import type { AgentIdentity } from '../core/identity';
import type { CaseBrief, FavoredParty, JurorAgent, Verdict } from './types';

export interface JuryDecision {
  readonly verdicts: readonly Verdict[];
  readonly winner: FavoredParty;
  readonly receipt: TransactionReceipt;
}

export interface ConveneJuryRequest {
  readonly provider: NetworkProvider;
  readonly contract: CourtContract;
  readonly brief: CaseBrief;
  /** Jurors in the same order as their public keys appear in the escrow terms. */
  readonly jurors: readonly [JurorAgent, JurorAgent, JurorAgent];
  readonly client: AgentIdentity;
  readonly worker: AgentIdentity;
}

/**
 * Every juror deliberates independently; the side with at least two votes wins,
 * and two jurors from that side sign the payout transaction.
 */
export async function conveneJury(request: ConveneJuryRequest): Promise<JuryDecision> {
  const { provider, contract, brief, jurors, client, worker } = request;

  const verdicts = await Promise.all(
    jurors.map(function askForVerdict(juror) {
      return juror.deliberate(brief);
    }),
  );

  const votesForWorker = countVotes(verdicts, 'worker');
  const votesForClient = countVotes(verdicts, 'client');
  const winner: FavoredParty = votesForWorker >= JUROR_QUORUM ? 'worker' : 'client';
  const winningVotes = winner === 'worker' ? votesForWorker : votesForClient;
  if (winningVotes < JUROR_QUORUM) {
    throw new JuryQuorumError(`${votesForWorker} for the worker, ${votesForClient} for the client`);
  }

  const signingJurors = selectSigningJurors(jurors, verdicts, winner);
  const beneficiary = winner === 'worker' ? worker : client;
  const receipt = await executeJuryRuling({
    provider,
    contract,
    beneficiaryAddress: beneficiary.address,
    firstJuror: signingJurors[0],
    secondJuror: signingJurors[1],
  });

  return { verdicts, winner, receipt };
}

function countVotes(verdicts: readonly Verdict[], party: FavoredParty): number {
  return verdicts.filter(function votedFor(verdict) {
    return verdict.favoredParty === party;
  }).length;
}

function selectSigningJurors(
  jurors: readonly [JurorAgent, JurorAgent, JurorAgent],
  verdicts: readonly Verdict[],
  winner: FavoredParty,
): [AgentIdentity, AgentIdentity] {
  const winningIdentities: AgentIdentity[] = [];
  for (const [jurorIndex, juror] of jurors.entries()) {
    if (verdicts[jurorIndex]?.favoredParty === winner) {
      winningIdentities.push(juror.identity);
    }
  }
  const [firstSigner, secondSigner] = winningIdentities;
  if (firstSigner === undefined || secondSigner === undefined) {
    throw new JuryQuorumError('fewer than two jurors voted for the winning side');
  }
  return [firstSigner, secondSigner];
}
