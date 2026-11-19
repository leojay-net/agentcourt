import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { parseRosterFile, type AgentRoster } from '../src/core/agentRoster';
import { parseCaseRecord, type CaseRecord } from '../src/core/caseRecord';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
export const ROSTER_FILE_PATH = resolve(PROJECT_ROOT, '.keys/chipnet-agents.json');
export const CASE_RECORD_DIRECTORY = resolve(PROJECT_ROOT, 'web/public/cases');
const CASE_INDEX_FILE_NAME = 'index.json';

export interface ChipnetSession {
  readonly provider: ElectrumNetworkProvider;
  readonly roster: AgentRoster;
}

export async function openChipnetSession(): Promise<ChipnetSession> {
  const roster = parseRosterFile(readFileSync(ROSTER_FILE_PATH, 'utf-8'), 'chipnet');
  const provider = new ElectrumNetworkProvider(Network.CHIPNET, {
    manualConnectionManagement: true,
  });
  await provider.connect();
  return { provider, roster };
}

export async function closeChipnetSession(session: ChipnetSession): Promise<void> {
  await session.provider.disconnect();
}

export function writeCaseRecord(record: CaseRecord): void {
  mkdirSync(CASE_RECORD_DIRECTORY, { recursive: true });
  const recordPath = resolve(CASE_RECORD_DIRECTORY, `${record.caseId}.json`);
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  rebuildCaseIndex();
}

export function readCaseRecord(caseId: string): CaseRecord {
  const recordPath = resolve(CASE_RECORD_DIRECTORY, `${caseId}.json`);
  return parseCaseRecord(readFileSync(recordPath, 'utf-8'));
}

function rebuildCaseIndex(): void {
  const caseIds = readdirSync(CASE_RECORD_DIRECTORY)
    .filter(function isCaseFile(fileName) {
      return fileName.endsWith('.json') && fileName !== CASE_INDEX_FILE_NAME;
    })
    .map(function stripExtension(fileName) {
      return fileName.replace(/\.json$/, '');
    })
    .sort();
  writeFileSync(
    resolve(CASE_RECORD_DIRECTORY, CASE_INDEX_FILE_NAME),
    `${JSON.stringify({ caseIds }, null, 2)}\n`,
  );
}
