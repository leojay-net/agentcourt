import { z } from 'zod';
import { caseRecordSchema, type CaseRecord } from '../../../src/core/caseRecord';

const caseIndexSchema = z.object({ caseIds: z.array(z.string()) });

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Request for ${path} failed with status ${response.status}`);
  }
  return response.json();
}

export async function loadCaseRecords(): Promise<CaseRecord[]> {
  const { caseIds } = caseIndexSchema.parse(await fetchJson('/cases/index.json'));
  const records = await Promise.all(
    caseIds.map(async function loadOne(caseId) {
      return caseRecordSchema.parse(await fetchJson(`/cases/${caseId}.json`));
    }),
  );
  return records;
}
