import { z } from 'zod';
import { fieldRequirementSchema, verdictSchema } from '../core/caseRecord';

export const jobFileSchema = z.object({
  caseId: z.string(),
  title: z.string(),
  summary: z.string(),
  mode: z.enum(['hash-check', 'jury']),
  requiredFields: z.array(fieldRequirementSchema),
  escrowSatoshis: z.number(),
  contractAddress: z.string(),
  terms: z.object({
    clientPublicKeyHashHex: z.string(),
    workerPublicKeyHashHex: z.string(),
    jurorPublicKeysHex: z.tuple([z.string(), z.string(), z.string()]),
    acceptanceHashHex: z.string(),
    refundBlockHeight: z.number(),
  }),
  fundingTransactionId: z.string(),
  status: z.enum(['open', 'settled', 'submitted-to-court', 'ruled-for-worker', 'ruled-for-client']),
  deliverableText: z.string().nullable(),
  deliveredAtBlockHeight: z.number().nullable(),
  settlementTransactionId: z.string().nullable(),
  rulingTransactionId: z.string().nullable(),
  verdicts: z.array(verdictSchema),
});

import type { FieldRequirement } from '../jurors/types';

export type JobFile = z.infer<typeof jobFileSchema>;

export interface JobStore {
  save(job: JobFile): void;
  load(caseId: string): JobFile;
  list(): JobFile[];
}

export class JobNotFoundError extends Error {
  public constructor(caseId: string) {
    super(`No job with id "${caseId}"`);
    this.name = 'JobNotFoundError';
  }
}

/** Holds jobs in memory, for agents that run inside one process such as the browser console. */
export function createMemoryJobStore(): JobStore {
  const jobsByCaseId = new Map<string, JobFile>();

  function load(caseId: string): JobFile {
    const job = jobsByCaseId.get(caseId);
    if (job === undefined) {
      throw new JobNotFoundError(caseId);
    }
    return structuredClone(job);
  }

  function save(job: JobFile): void {
    jobsByCaseId.set(job.caseId, structuredClone(jobFileSchema.parse(job)));
  }

  function list(): JobFile[] {
    return [...jobsByCaseId.values()].map(function copyJob(job) {
      return structuredClone(job);
    });
  }

  return { save, load, list };
}

/** Drops optional bounds that are present but undefined, which the strict FieldRequirement type refuses. */
export function toFieldRequirement(stored: JobFile['requiredFields'][number]): FieldRequirement {
  return {
    fieldName: stored.fieldName,
    kind: stored.kind,
    ...(stored.minimumLength === undefined ? {} : { minimumLength: stored.minimumLength }),
    ...(stored.minimumValue === undefined ? {} : { minimumValue: stored.minimumValue }),
    ...(stored.maximumValue === undefined ? {} : { maximumValue: stored.maximumValue }),
  };
}
