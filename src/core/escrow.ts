import {
  TransactionBuilder,
  type NetworkProvider,
  type SpendableUtxo,
} from 'cashscript';
import {
  ESCROW_SPEND_FEE_SATOSHIS,
  MAXIMUM_DELIVERABLE_BYTES,
  MINIMUM_ESCROW_SATOSHIS,
  MINIMUM_RELAY_FEE_RATE,
} from './constants';
import type { CourtContract } from './courtContract';
import {
  DeliverableTooLargeError,
  EscrowNotFundedError,
  InsufficientFundsError,
  InvalidTermsError,
} from './errors';
import type { AgentIdentity } from './identity';

/** Sequence value that keeps absolute locktime enforceable on an input. */
const NON_FINAL_SEQUENCE_NUMBER = 0xfffffffe;

/** Headroom on top of the escrow so the funding transaction can pay its own fee. */
const FUNDING_FEE_BUFFER_SATOSHIS = 1500n;

export interface TransactionReceipt {
  readonly transactionId: string;
  readonly rawTransactionHex: string;
}

export interface FundEscrowRequest {
  readonly provider: NetworkProvider;
  readonly contract: CourtContract;
  readonly funder: AgentIdentity;
  readonly escrowSatoshis: bigint;
}

export interface SettleEscrowRequest {
  readonly provider: NetworkProvider;
  readonly contract: CourtContract;
  readonly worker: AgentIdentity;
  readonly deliverable: Uint8Array;
}

export interface RefundEscrowRequest {
  readonly provider: NetworkProvider;
  readonly contract: CourtContract;
  readonly client: AgentIdentity;
  readonly refundBlockHeight: number;
}

export type RulingBeneficiary = 'worker' | 'client';

export interface JuryRulingRequest {
  readonly provider: NetworkProvider;
  readonly contract: CourtContract;
  readonly beneficiaryAddress: string;
  /** Exactly two signing jurors, ordered as their keys appear in the contract terms. */
  readonly firstJuror: AgentIdentity;
  readonly secondJuror: AgentIdentity;
}

export async function findEscrowUtxo(contract: CourtContract): Promise<SpendableUtxo> {
  const escrowUtxos = await contract.getUtxos();
  const largestUtxo = escrowUtxos.reduce(
    function keepLargest(currentLargest: SpendableUtxo | undefined, candidate: SpendableUtxo) {
      if (currentLargest === undefined || candidate.satoshis > currentLargest.satoshis) {
        return candidate;
      }
      return currentLargest;
    },
    undefined,
  );
  if (largestUtxo === undefined) {
    throw new EscrowNotFundedError(contract.address);
  }
  return largestUtxo;
}

function selectFundingUtxos(
  availableUtxos: readonly SpendableUtxo[],
  requiredSatoshis: bigint,
  funderAddress: string,
): SpendableUtxo[] {
  const plainBchUtxos = availableUtxos
    .filter(function hasNoToken(utxo) {
      return utxo.token === undefined;
    })
    .sort(function byDescendingValue(first, second) {
      return Number(second.satoshis - first.satoshis);
    });

  const selectedUtxos: SpendableUtxo[] = [];
  let selectedSatoshis = 0n;
  for (const utxo of plainBchUtxos) {
    selectedUtxos.push(utxo);
    selectedSatoshis += utxo.satoshis;
    if (selectedSatoshis >= requiredSatoshis) {
      return selectedUtxos;
    }
  }
  throw new InsufficientFundsError(funderAddress, requiredSatoshis, selectedSatoshis);
}

export async function fundEscrow(request: FundEscrowRequest): Promise<TransactionReceipt> {
  const { provider, contract, funder, escrowSatoshis } = request;
  if (escrowSatoshis < MINIMUM_ESCROW_SATOSHIS) {
    throw new InvalidTermsError(
      `escrow must hold at least ${MINIMUM_ESCROW_SATOSHIS} satoshis, received ${escrowSatoshis}`,
    );
  }

  const funderUtxos = await provider.getUtxos(funder.address);
  const fundingUtxos = selectFundingUtxos(
    funderUtxos,
    escrowSatoshis + FUNDING_FEE_BUFFER_SATOSHIS,
    funder.address,
  );

  const transactionBuilder = new TransactionBuilder({ provider });
  transactionBuilder.addInputs(fundingUtxos, funder.signatureTemplate.unlockP2PKH());
  transactionBuilder.addOutput({ to: contract.address, amount: escrowSatoshis });
  transactionBuilder.addBchChangeOutputIfNeeded({
    to: funder.address,
    feeRate: MINIMUM_RELAY_FEE_RATE,
  });

  return broadcast(transactionBuilder);
}

export async function settleEscrow(request: SettleEscrowRequest): Promise<TransactionReceipt> {
  const { provider, contract, worker, deliverable } = request;
  if (deliverable.length > MAXIMUM_DELIVERABLE_BYTES) {
    throw new DeliverableTooLargeError(deliverable.length, MAXIMUM_DELIVERABLE_BYTES);
  }

  const escrowUtxo = await findEscrowUtxo(contract);
  const transactionBuilder = new TransactionBuilder({ provider });
  transactionBuilder.addInput(
    escrowUtxo,
    contract.unlock.settle(worker.publicKey, worker.signatureTemplate, deliverable),
  );
  transactionBuilder.addOutput({
    to: worker.address,
    amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
  });

  return broadcast(transactionBuilder);
}

export async function refundEscrow(request: RefundEscrowRequest): Promise<TransactionReceipt> {
  const { provider, contract, client, refundBlockHeight } = request;

  const escrowUtxo = await findEscrowUtxo(contract);
  const transactionBuilder = new TransactionBuilder({ provider });
  transactionBuilder.addInput(
    escrowUtxo,
    contract.unlock.refund(client.publicKey, client.signatureTemplate),
    { sequence: NON_FINAL_SEQUENCE_NUMBER },
  );
  transactionBuilder.addOutput({
    to: client.address,
    amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
  });
  transactionBuilder.setLocktime(refundBlockHeight);

  return broadcast(transactionBuilder);
}

export async function executeJuryRuling(request: JuryRulingRequest): Promise<TransactionReceipt> {
  const { provider, contract, beneficiaryAddress, firstJuror, secondJuror } = request;

  const escrowUtxo = await findEscrowUtxo(contract);
  const transactionBuilder = new TransactionBuilder({ provider });
  transactionBuilder.addInput(escrowUtxo, contract.unlock.rule(firstJuror.multisigSignatureTemplate, secondJuror.multisigSignatureTemplate));
  transactionBuilder.addOutput({
    to: beneficiaryAddress,
    amount: escrowUtxo.satoshis - ESCROW_SPEND_FEE_SATOSHIS,
  });

  return broadcast(transactionBuilder);
}

async function broadcast(transactionBuilder: TransactionBuilder): Promise<TransactionReceipt> {
  const transactionDetails = await transactionBuilder.send();
  return {
    transactionId: transactionDetails.txid,
    rawTransactionHex: transactionDetails.hex,
  };
}
