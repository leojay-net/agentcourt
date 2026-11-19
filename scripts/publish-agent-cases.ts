import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseRosterFile } from '../src/core/agentRoster';
import { caseRecordSchema, type CaseRecord, type CaseTransaction } from '../src/core/caseRecord';
import type { JobFile } from '../src/agent/jobStore';
import { writeCaseRecord } from './chipnetSession';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const SESSION_PATH = resolve(PROJECT_ROOT, 'demo/agent-session.json');
const ROSTER_FILE_PATH = resolve(PROJECT_ROOT, '.keys/chipnet-agents.json');

function describeTransactions(job: JobFile): CaseTransaction[] {
  const transactions: CaseTransaction[] = [
    { kind: 'funding', label: 'Client agent funds the escrow', transactionId: job.fundingTransactionId },
  ];
  if (job.settlementTransactionId !== null) {
    transactions.push({
      kind: 'settlement',
      label: 'Worker agent reveals the deliverable; covenant pays out',
      transactionId: job.settlementTransactionId,
    });
  }
  if (job.rulingTransactionId !== null) {
    transactions.push({
      kind: 'ruling',
      label: 'Two jurors sign the payout transaction',
      transactionId: job.rulingTransactionId,
    });
  }
  return transactions;
}

function toCaseRecord(job: JobFile, clientAddress: string, workerAddress: string): CaseRecord {
  const isJuryCase = job.mode === 'jury';
  const status = job.status === 'settled' ? 'settled' : job.status === 'ruled-for-worker' ? 'ruled-for-worker' : 'ruled-for-client';
  const scenarioKind = !isJuryCase ? 'deterministic-settlement' : status === 'ruled-for-worker' ? 'jury-for-worker' : 'jury-for-client';
  return caseRecordSchema.parse({
    schemaVersion: 1,
    caseId: job.caseId,
    title: job.title,
    scenarioKind,
    network: 'chipnet',
    specification: { summary: job.summary, requiredFields: job.requiredFields },
    terms: job.terms,
    contractAddress: job.contractAddress,
    clientAddress,
    workerAddress,
    escrowSatoshis: job.escrowSatoshis,
    deliverableText: job.deliverableText,
    status,
    verdicts: job.verdicts,
    transactions: describeTransactions(job),
  });
}

function main(): void {
  const roster = parseRosterFile(readFileSync(ROSTER_FILE_PATH, 'utf-8'), 'chipnet');
  const session = JSON.parse(readFileSync(SESSION_PATH, 'utf-8')) as { jobs: JobFile[] };
  for (const job of session.jobs) {
    if (job.status === 'open' || job.status === 'submitted-to-court') {
      continue;
    }
    writeCaseRecord(toCaseRecord(job, roster.client.address, roster.worker.address));
    console.log(`Published ${job.caseId} as ${job.status}`);
  }
}

main();
