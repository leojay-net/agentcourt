import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { fieldRequirementSchema, verdictSchema } from '../core/caseRecord';

const jobFileSchema = z.object({
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

/** Jobs are plain JSON files in one directory, which is all the coordination the demo's agents need. */
export function createJobStore(jobDirectory: string): JobStore {
  mkdirSync(jobDirectory, { recursive: true });

  function pathFor(caseId: string): string {
    return resolve(jobDirectory, `${caseId}.json`);
  }

  function load(caseId: string): JobFile {
    let fileContents: string;
    try {
      fileContents = readFileSync(pathFor(caseId), 'utf-8');
    } catch {
      throw new JobNotFoundError(caseId);
    }
    return jobFileSchema.parse(JSON.parse(fileContents));
  }

  function save(job: JobFile): void {
    writeFileSync(pathFor(job.caseId), JSON.stringify(jobFileSchema.parse(job), null, 2));
  }

  function list(): JobFile[] {
    return readdirSync(jobDirectory)
      .filter(function isJobFile(fileName) {
        return fileName.endsWith('.json');
      })
      .map(function loadJob(fileName) {
        return load(fileName.replace(/\.json$/, ''));
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
