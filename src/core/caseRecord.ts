import { z } from 'zod';

const fieldRequirementSchema = z.object({
  fieldName: z.string(),
  kind: z.enum(['string', 'number', 'array']),
  minimumLength: z.number().optional(),
  minimumValue: z.number().optional(),
  maximumValue: z.number().optional(),
});

const findingSchema = z.object({
  checkName: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});

const verdictSchema = z.object({
  jurorLabel: z.string(),
  jurorPublicKeyHex: z.string(),
  favoredParty: z.enum(['worker', 'client']),
  findings: z.array(findingSchema),
  reasoning: z.string(),
});

const transactionKindSchema = z.enum(['funding', 'settlement', 'refund', 'ruling']);

export const caseRecordSchema = z.object({
  schemaVersion: z.literal(1),
  caseId: z.string(),
  title: z.string(),
  scenarioKind: z.enum([
    'deterministic-settlement',
    'jury-for-worker',
    'jury-for-client',
    'timeout-refund',
  ]),
  network: z.enum(['chipnet', 'mainnet', 'mocknet']),
  specification: z.object({
    summary: z.string(),
    requiredFields: z.array(fieldRequirementSchema),
  }),
  terms: z.object({
    clientPublicKeyHashHex: z.string(),
    workerPublicKeyHashHex: z.string(),
    jurorPublicKeysHex: z.tuple([z.string(), z.string(), z.string()]),
    acceptanceHashHex: z.string(),
    refundBlockHeight: z.number(),
  }),
  contractAddress: z.string(),
  clientAddress: z.string(),
  workerAddress: z.string(),
  escrowSatoshis: z.number(),
  deliverableText: z.string().nullable(),
  status: z.enum([
    'awaiting-deadline',
    'settled',
    'refunded',
    'ruled-for-worker',
    'ruled-for-client',
  ]),
  verdicts: z.array(verdictSchema),
  transactions: z.array(
    z.object({
      kind: transactionKindSchema,
      label: z.string(),
      transactionId: z.string().length(64),
    }),
  ),
});

export type CaseRecord = z.infer<typeof caseRecordSchema>;
export type CaseTransaction = CaseRecord['transactions'][number];
export type CaseStatus = CaseRecord['status'];
export type ScenarioKind = CaseRecord['scenarioKind'];

export function parseCaseRecord(serializedRecord: string): CaseRecord {
  return caseRecordSchema.parse(JSON.parse(serializedRecord));
}
