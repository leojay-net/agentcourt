import { Contract, type NetworkProvider } from 'cashscript';
import agentCourtArtifact from '../../artifacts/AgentCourt.artifact';
import { validateEscrowTerms, type EscrowTerms } from './terms';

export type CourtContract = Contract<typeof agentCourtArtifact>;

export function instantiateCourtContract(
  terms: EscrowTerms,
  provider: NetworkProvider,
): CourtContract {
  validateEscrowTerms(terms);
  return new Contract(
    agentCourtArtifact,
    [
      terms.clientPublicKeyHash,
      terms.workerPublicKeyHash,
      terms.jurorPublicKeys[0],
      terms.jurorPublicKeys[1],
      terms.jurorPublicKeys[2],
      terms.acceptanceHash,
      BigInt(terms.refundBlockHeight),
    ],
    { provider },
  );
}
