import type { NetworkProvider } from 'cashscript';
import { sha256 } from '@bitauth/libauth';
import type { AgentRoster } from '../core/agentRoster';
import type { CaseRecord, CaseTransaction } from '../core/caseRecord';
import { instantiateCourtContract, type CourtContract } from '../core/courtContract';
import { fundEscrow, refundEscrow, settleEscrow, type TransactionReceipt } from '../core/escrow';
import { decodeHex, encodeUtf8 } from '../core/hex';
import {
  computeAcceptanceHash,
  serializeEscrowTerms,
  type EscrowTerms,
} from '../core/terms';
import { conveneJury } from '../jurors/jury';
import type { CaseBrief, JurorAgent } from '../jurors/types';
import { StructureJuror, SubstanceJuror, TimelinessJuror } from '../jurors/verifierJurors';
import type { ScenarioDefinition } from './definitions';

export interface ScenarioContext {
  readonly provider: NetworkProvider;
  readonly roster: AgentRoster;
  readonly network: CaseRecord['network'];
}

/**
 * Work that cannot be reduced to a hash is committed to a hash nobody can
 * satisfy, so the settle path stays closed and only the jury or timeout apply.
 */
function createUnsatisfiableAcceptanceHash(): Uint8Array {
  const unknowablePreimage = crypto.getRandomValues(new Uint8Array(32));
  return sha256.hash(unknowablePreimage);
}

function selectAcceptanceHash(definition: ScenarioDefinition): Uint8Array {
  if (definition.kind === 'deterministic-settlement' && definition.deliverableText !== null) {
    return computeAcceptanceHash(encodeUtf8(definition.deliverableText));
  }
  return createUnsatisfiableAcceptanceHash();
}

function buildTerms(
  definition: ScenarioDefinition,
  roster: AgentRoster,
  currentBlockHeight: number,
): EscrowTerms {
  return {
    clientPublicKeyHash: roster.client.publicKeyHash,
    workerPublicKeyHash: roster.worker.publicKeyHash,
    jurorPublicKeys: [
      roster.jurorOne.publicKey,
      roster.jurorTwo.publicKey,
      roster.jurorThree.publicKey,
    ],
    acceptanceHash: selectAcceptanceHash(definition),
    refundBlockHeight: currentBlockHeight + definition.refundDelayInBlocks,
  };
}

function createJurors(roster: AgentRoster): [JurorAgent, JurorAgent, JurorAgent] {
  return [
    new StructureJuror(roster.jurorOne),
    new SubstanceJuror(roster.jurorTwo),
    new TimelinessJuror(roster.jurorThree),
  ];
}

function describeTransaction(
  kind: CaseTransaction['kind'],
  label: string,
  receipt: TransactionReceipt,
): CaseTransaction {
  return { kind, label, transactionId: receipt.transactionId };
}

export async function runScenario(
  definition: ScenarioDefinition,
  context: ScenarioContext,
): Promise<CaseRecord> {
  const { provider, roster, network } = context;
  const currentBlockHeight = await provider.getBlockHeight();
  const terms = buildTerms(definition, roster, currentBlockHeight);
  const contract = instantiateCourtContract(terms, provider);

  const fundingReceipt = await fundEscrow({
    provider,
    contract,
    funder: roster.client,
    escrowSatoshis: definition.escrowSatoshis,
  });
  const transactions: CaseTransaction[] = [
    describeTransaction('funding', 'Client funds the escrow', fundingReceipt),
  ];

  const baseRecord = {
    schemaVersion: 1 as const,
    caseId: definition.caseId,
    title: definition.title,
    scenarioKind: definition.kind,
    network,
    specification: {
      summary: definition.specification.summary,
      requiredFields: [...definition.specification.requiredFields],
    },
    terms: serializeEscrowTerms(terms),
    contractAddress: contract.address,
    clientAddress: roster.client.address,
    workerAddress: roster.worker.address,
    escrowSatoshis: Number(definition.escrowSatoshis),
    deliverableText: definition.deliverableText,
  };

  switch (definition.kind) {
    case 'deterministic-settlement':
      return settleByDeliverable(baseRecord, definition, contract, context, transactions);
    case 'jury-for-worker':
    case 'jury-for-client':
      return settleByJury(baseRecord, definition, contract, context, terms, transactions);
    case 'timeout-refund':
      return { ...baseRecord, status: 'awaiting-deadline', verdicts: [], transactions };
  }
}

type BaseRecord = Omit<CaseRecord, 'status' | 'verdicts' | 'transactions'>;

async function settleByDeliverable(
  baseRecord: BaseRecord,
  definition: ScenarioDefinition,
  contract: CourtContract,
  context: ScenarioContext,
  transactions: CaseTransaction[],
): Promise<CaseRecord> {
  if (definition.deliverableText === null) {
    throw new Error(`Scenario ${definition.caseId} has no deliverable to settle with`);
  }
  const settlementReceipt = await settleEscrow({
    provider: context.provider,
    contract,
    worker: context.roster.worker,
    deliverable: encodeUtf8(definition.deliverableText),
  });
  transactions.push(
    describeTransaction('settlement', 'Worker reveals the deliverable; covenant pays out', settlementReceipt),
  );
  return { ...baseRecord, status: 'settled', verdicts: [], transactions };
}

async function settleByJury(
  baseRecord: BaseRecord,
  definition: ScenarioDefinition,
  contract: CourtContract,
  context: ScenarioContext,
  terms: EscrowTerms,
  transactions: CaseTransaction[],
): Promise<CaseRecord> {
  const currentBlockHeight = await context.provider.getBlockHeight();
  const brief: CaseBrief = {
    caseTitle: definition.title,
    specification: definition.specification,
    deliverableText: definition.deliverableText,
    deliveredAtBlockHeight: definition.deliverableText === null ? null : currentBlockHeight,
    deadlineBlockHeight: terms.refundBlockHeight,
  };

  const decision = await conveneJury({
    provider: context.provider,
    contract,
    brief,
    jurors: createJurors(context.roster),
    client: context.roster.client,
    worker: context.roster.worker,
  });
  transactions.push(
    describeTransaction('ruling', 'Two jurors sign the payout transaction', decision.receipt),
  );
  return {
    ...baseRecord,
    status: decision.winner === 'worker' ? 'ruled-for-worker' : 'ruled-for-client',
    verdicts: [...decision.verdicts],
    transactions,
  };
}

export async function completePendingRefund(
  record: CaseRecord,
  context: ScenarioContext,
): Promise<CaseRecord> {
  if (record.status !== 'awaiting-deadline') {
    throw new Error(`Case ${record.caseId} is ${record.status}, not awaiting its deadline`);
  }
  const terms = {
    clientPublicKeyHash: context.roster.client.publicKeyHash,
    workerPublicKeyHash: context.roster.worker.publicKeyHash,
    jurorPublicKeys: [
      context.roster.jurorOne.publicKey,
      context.roster.jurorTwo.publicKey,
      context.roster.jurorThree.publicKey,
    ] as const,
    acceptanceHash: decodeHex(record.terms.acceptanceHashHex, 32),
    refundBlockHeight: record.terms.refundBlockHeight,
  };
  const contract = instantiateCourtContract(terms, context.provider);
  if (contract.address !== record.contractAddress) {
    throw new Error(
      `Rebuilt contract address ${contract.address} differs from recorded ${record.contractAddress}`,
    );
  }

  const refundReceipt = await refundEscrow({
    provider: context.provider,
    contract,
    client: context.roster.client,
    refundBlockHeight: record.terms.refundBlockHeight,
  });
  return {
    ...record,
    status: 'refunded',
    transactions: [
      ...record.transactions,
      describeTransaction('refund', 'Deadline passed; client reclaims the escrow', refundReceipt),
    ],
  };
}
