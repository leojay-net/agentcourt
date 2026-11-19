import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { describe, expect, it } from 'vitest';
import { createJobStore } from '../src/agent/jobStore';
import { createClientTools, createWorkerTools } from '../src/agent/courtAgentTools';
import { ruleOnSubmittedJob } from '../src/agent/courtService';
import { generateRosterFile, parseRosterFile } from '../src/core/agentRoster';

const ESCROW_SATOSHIS = 3_000;
const STARTING_BALANCE_SATOSHIS = 50_000n;

function createWorld() {
  const roster = parseRosterFile(JSON.stringify(generateRosterFile('mocknet')), 'mocknet');
  const provider = new MockNetworkProvider();
  provider.addUtxo(roster.client.address, randomUtxo({ satoshis: STARTING_BALANCE_SATOSHIS }));
  const jobStore = createJobStore(mkdtempSync(join(tmpdir(), 'agentcourt-jobs-')));
  const parties = {
    clientPublicKeyHash: roster.client.publicKeyHash,
    workerPublicKeyHash: roster.worker.publicKeyHash,
    jurorPublicKeys: [roster.jurorOne.publicKey, roster.jurorTwo.publicKey, roster.jurorThree.publicKey] as const,
  };
  return {
    roster,
    provider,
    jobStore,
    clientTools: createClientTools(provider, roster.client, parties, jobStore),
    workerTools: createWorkerTools(provider, roster.worker, jobStore),
  };
}

describe('agent tools for the court', () => {
  it('settles a hash-checked job when the worker delivers the exact result', async () => {
    const world = createWorld();
    const opened = await world.clientTools.openEscrow({
      title: 'Sort numbers',
      summary: 'Sort ascending',
      expectedResult: '[1,2,3]',
      escrowSatoshis: ESCROW_SATOSHIS,
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;

    const delivery = await world.workerTools.deliverWork(opened.caseId, '[1,2,3]');

    expect(delivery).toMatchObject({ ok: true, status: 'settled' });
    expect(world.clientTools.getEscrow(opened.caseId)).toMatchObject({ ok: true, job: { status: 'settled' } });
  });

  it('refuses a deliverable that does not match the committed hash', async () => {
    const world = createWorld();
    const opened = await world.clientTools.openEscrow({
      title: 'Sort numbers',
      summary: 'Sort ascending',
      expectedResult: '[1,2,3]',
      escrowSatoshis: ESCROW_SATOSHIS,
    });
    if (!opened.ok) throw new Error(opened.reason);

    const delivery = await world.workerTools.deliverWork(opened.caseId, '[3,2,1]');

    expect(delivery.ok).toBe(false);
    expect(world.workerTools.listJobs()).toHaveLength(1);
  });

  it('sends a jury job to the court, which rules and pays the winner', async () => {
    const world = createWorld();
    const opened = await world.clientTools.openEscrow({
      title: 'Write a brief',
      summary: 'A brief with a headline',
      requiredFields: [{ fieldName: 'headline', kind: 'string', minimumLength: 5 }],
      escrowSatoshis: ESCROW_SATOSHIS,
    });
    if (!opened.ok) throw new Error(opened.reason);
    expect(opened.mode).toBe('jury');

    const delivery = await world.workerTools.deliverWork(opened.caseId, '{"headline":"A solid headline"}');
    expect(delivery).toMatchObject({ ok: true, status: 'submitted-to-court' });

    const ruledJob = await ruleOnSubmittedJob(world.provider, world.roster, world.jobStore, opened.caseId);
    expect(ruledJob.verdicts).toHaveLength(3);
    expect(['ruled-for-worker', 'ruled-for-client']).toContain(ruledJob.status);
    expect(ruledJob.rulingTransactionId).not.toBeNull();
  });

  it('rejects work on a job that is not open', async () => {
    const world = createWorld();
    const opened = await world.clientTools.openEscrow({
      title: 'Sort numbers',
      summary: 'Sort ascending',
      expectedResult: '[1]',
      escrowSatoshis: ESCROW_SATOSHIS,
    });
    if (!opened.ok) throw new Error(opened.reason);
    await world.workerTools.deliverWork(opened.caseId, '[1]');

    const secondDelivery = await world.workerTools.deliverWork(opened.caseId, '[1]');

    expect(secondDelivery).toMatchObject({ ok: false });
  });
});
