import { sha256 } from '@bitauth/libauth';
import type { NetworkProvider } from 'cashscript';
import { instantiateCourtContract } from '../core/courtContract';
import { fundEscrow, settleEscrow } from '../core/escrow';
import { encodeUtf8 } from '../core/hex';
import type { AgentIdentity } from '../core/identity';
import { computeAcceptanceHash, deserializeEscrowTerms, serializeEscrowTerms, type EscrowTerms } from '../core/terms';
import type { FieldRequirement } from '../jurors/types';
import type { JobFile, JobStore } from './jobStore';

const DEFAULT_REFUND_DELAY_BLOCKS = 144;
const ACCEPTANCE_HASH_BYTE_LENGTH = 32;
const DEBUG_LINK_MARKER = 'WARNING:';

export interface EscrowParties {
  readonly clientPublicKeyHash: Uint8Array;
  readonly workerPublicKeyHash: Uint8Array;
  readonly jurorPublicKeys: readonly [Uint8Array, Uint8Array, Uint8Array];
}

export interface OpenEscrowInput {
  readonly title: string;
  readonly summary: string;
  /** The exact result the client expects. When given, the covenant checks the work itself. */
  readonly expectedResult?: string;
  /** For work a jury must judge: what the deliverable JSON has to contain. */
  readonly requiredFields?: readonly FieldRequirement[];
  readonly escrowSatoshis: number;
}

export type ToolOutcome<Success extends object> =
  | ({ readonly ok: true } & Success)
  | { readonly ok: false; readonly reason: string };

export interface ClientTools {
  openEscrow(input: OpenEscrowInput): Promise<ToolOutcome<{ caseId: string; contractAddress: string; fundingTransactionId: string; mode: JobFile['mode'] }>>;
  getEscrow(caseId: string): ToolOutcome<{ job: JobFile }>;
}

export interface WorkerTools {
  listJobs(): JobFile[];
  deliverWork(caseId: string, deliverable: string): Promise<ToolOutcome<{ status: JobFile['status']; settlementTransactionId: string | null }>>;
}

function failureReason(failure: unknown): string {
  const fullMessage = failure instanceof Error ? failure.message : String(failure);
  return fullMessage.split(DEBUG_LINK_MARKER)[0]?.trim() ?? fullMessage;
}

function createCaseId(title: string, blockHeight: number): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug}-${blockHeight}`;
}

/**
 * Work that cannot be reduced to a hash commits to a hash nobody can satisfy,
 * so the settle exit stays shut and only the jury or the timeout can move funds.
 */
function createUnsatisfiableAcceptanceHash(): Uint8Array {
  return sha256.hash(crypto.getRandomValues(new Uint8Array(ACCEPTANCE_HASH_BYTE_LENGTH)));
}

export function createClientTools(
  provider: NetworkProvider,
  client: AgentIdentity,
  parties: EscrowParties,
  jobStore: JobStore,
): ClientTools {
  async function openEscrow(input: OpenEscrowInput) {
    try {
      const currentBlockHeight = await provider.getBlockHeight();
      const mode: JobFile['mode'] = input.expectedResult === undefined ? 'jury' : 'hash-check';
      const terms: EscrowTerms = {
        clientPublicKeyHash: parties.clientPublicKeyHash,
        workerPublicKeyHash: parties.workerPublicKeyHash,
        jurorPublicKeys: parties.jurorPublicKeys,
        acceptanceHash:
          input.expectedResult === undefined
            ? createUnsatisfiableAcceptanceHash()
            : computeAcceptanceHash(encodeUtf8(input.expectedResult)),
        refundBlockHeight: currentBlockHeight + DEFAULT_REFUND_DELAY_BLOCKS,
      };
      const contract = instantiateCourtContract(terms, provider);
      const funding = await fundEscrow({
        provider,
        contract,
        funder: client,
        escrowSatoshis: BigInt(input.escrowSatoshis),
      });
      const caseId = createCaseId(input.title, currentBlockHeight);
      jobStore.save({
        caseId,
        title: input.title,
        summary: input.summary,
        mode,
        requiredFields: [...(input.requiredFields ?? [])],
        escrowSatoshis: input.escrowSatoshis,
        contractAddress: contract.address,
        terms: serializeEscrowTerms(terms),
        fundingTransactionId: funding.transactionId,
        status: 'open',
        deliverableText: null,
        deliveredAtBlockHeight: null,
        settlementTransactionId: null,
        rulingTransactionId: null,
        verdicts: [],
      });
      return {
        ok: true as const,
        caseId,
        contractAddress: contract.address,
        fundingTransactionId: funding.transactionId,
        mode,
      };
    } catch (failure) {
      return { ok: false as const, reason: failureReason(failure) };
    }
  }

  function getEscrow(caseId: string) {
    try {
      return { ok: true as const, job: jobStore.load(caseId) };
    } catch (failure) {
      return { ok: false as const, reason: failureReason(failure) };
    }
  }

  return { openEscrow, getEscrow };
}

export function createWorkerTools(
  provider: NetworkProvider,
  worker: AgentIdentity,
  jobStore: JobStore,
): WorkerTools {
  function listJobs(): JobFile[] {
    return jobStore.list().filter(function isOpen(job) {
      return job.status === 'open';
    });
  }

  async function deliverWork(caseId: string, deliverable: string) {
    try {
      const job = jobStore.load(caseId);
      if (job.status !== 'open') {
        return { ok: false as const, reason: `job ${caseId} is already ${job.status}` };
      }
      if (job.mode === 'jury') {
        jobStore.save({
          ...job,
          status: 'submitted-to-court',
          deliverableText: deliverable,
          deliveredAtBlockHeight: await provider.getBlockHeight(),
        });
        return { ok: true as const, status: 'submitted-to-court' as const, settlementTransactionId: null };
      }
      const terms = deserializeEscrowTerms(job.terms);
      const contract = instantiateCourtContract(terms, provider);
      const settlement = await settleEscrow({
        provider,
        contract,
        worker,
        deliverable: encodeUtf8(deliverable),
      });
      jobStore.save({
        ...job,
        status: 'settled',
        deliverableText: deliverable,
        settlementTransactionId: settlement.transactionId,
      });
      return { ok: true as const, status: 'settled' as const, settlementTransactionId: settlement.transactionId };
    } catch (failure) {
      return { ok: false as const, reason: failureReason(failure) };
    }
  }

  return { listJobs, deliverWork };
}

