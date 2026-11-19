import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { instantiateCourtContract, type CourtContract } from '../src/core/courtContract';
import { computeAcceptanceHash, type EscrowTerms } from '../src/core/terms';
import { encodeUtf8 } from '../src/core/hex';
import { generateAgentIdentity, type AgentIdentity } from '../src/core/identity';

export const ESCROW_SATOSHIS = 20_000n;
export const REFUND_BLOCK_HEIGHT = 1_000;
export const ACCEPTED_DELIVERABLE = encodeUtf8('[1,2,3,5,8,13]');

export interface CourtFixture {
  readonly provider: MockNetworkProvider;
  readonly contract: CourtContract;
  readonly terms: EscrowTerms;
  readonly client: AgentIdentity;
  readonly worker: AgentIdentity;
  readonly jurors: readonly [AgentIdentity, AgentIdentity, AgentIdentity];
  readonly bystander: AgentIdentity;
}

export function createCourtFixture(): CourtFixture {
  const provider = new MockNetworkProvider();
  provider.setBlockHeight(REFUND_BLOCK_HEIGHT - 500);

  const client = generateAgentIdentity('client', 'mocknet');
  const worker = generateAgentIdentity('worker', 'mocknet');
  const bystander = generateAgentIdentity('bystander', 'mocknet');
  const jurors = [
    generateAgentIdentity('juror-one', 'mocknet'),
    generateAgentIdentity('juror-two', 'mocknet'),
    generateAgentIdentity('juror-three', 'mocknet'),
  ] as const;

  const terms: EscrowTerms = {
    clientPublicKeyHash: client.publicKeyHash,
    workerPublicKeyHash: worker.publicKeyHash,
    jurorPublicKeys: [jurors[0].publicKey, jurors[1].publicKey, jurors[2].publicKey],
    acceptanceHash: computeAcceptanceHash(ACCEPTED_DELIVERABLE),
    refundBlockHeight: REFUND_BLOCK_HEIGHT,
  };

  const contract = instantiateCourtContract(terms, provider);
  return { provider, contract, terms, client, worker, jurors, bystander };
}

export function depositEscrow(fixture: CourtFixture): void {
  fixture.provider.addUtxo(
    fixture.contract.address,
    randomUtxo({ satoshis: ESCROW_SATOSHIS }),
  );
}
