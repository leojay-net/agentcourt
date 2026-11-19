import { describe, expect, it } from 'vitest';
import { createMemoryJobStore, JobNotFoundError, type JobFile } from '../src/agent/jobModel';
import { createCourtSandbox } from '../web/src/agent/courtSandbox';
import type { AgentTool } from '../web/src/agent/modelClient';

function findTool(tools: readonly AgentTool[], name: string): AgentTool {
  const tool = tools.find(function matchesName(candidate) {
    return candidate.name === name;
  });
  if (tool === undefined) throw new Error(`tool ${name} missing`);
  return tool;
}

const SORTED_RESULT = '[1,2,3]';

describe('memory job store', function describeMemoryStore() {
  it('refuses to load a job that was never saved', function rejectsUnknownJob() {
    expect(function loadMissing() {
      createMemoryJobStore().load('missing');
    }).toThrow(JobNotFoundError);
  });
});

describe('court sandbox', function describeSandbox() {
  it('settles a hash-checked job when the worker delivers the exact result', async function settlesByHash() {
    const sandbox = createCourtSandbox();
    const opened = (await findTool(sandbox.clientTools, 'open_escrow').execute({
      title: 'Sort three numbers',
      summary: 'Sort 3,1,2 ascending as a JSON array',
      expectedResult: SORTED_RESULT,
      escrowSatoshis: 3000,
    })) as { ok: boolean; caseId: string };
    expect(opened.ok).toBe(true);

    const delivered = (await findTool(sandbox.workerTools, 'deliver_work').execute({
      caseId: opened.caseId,
      deliverable: SORTED_RESULT,
    })) as { ok: boolean; status: JobFile['status'] };
    expect(delivered.status).toBe('settled');
  });

  it('refuses a wrong delivery on a hash-checked job and leaves the funds locked', async function refusesWrongDelivery() {
    const sandbox = createCourtSandbox();
    const opened = (await findTool(sandbox.clientTools, 'open_escrow').execute({
      title: 'Sort three numbers',
      summary: 'Sort 3,1,2 ascending as a JSON array',
      expectedResult: SORTED_RESULT,
      escrowSatoshis: 3000,
    })) as { caseId: string };

    const delivered = (await findTool(sandbox.workerTools, 'deliver_work').execute({
      caseId: opened.caseId,
      deliverable: '[3,2,1]',
    })) as { ok: boolean };
    expect(delivered.ok).toBe(false);
    expect(sandbox.listJobs()[0]?.status).toBe('open');
  });

  it('sends a jury job to court and pays the worker when the jurors agree', async function ruledByJury() {
    const sandbox = createCourtSandbox();
    const opened = (await findTool(sandbox.clientTools, 'open_escrow').execute({
      title: 'Short brief',
      summary: 'A short brief with a headline',
      requiredFields: [{ fieldName: 'headline', kind: 'string', minimumLength: 5 }],
      escrowSatoshis: 3000,
    })) as { caseId: string };
    await findTool(sandbox.workerTools, 'deliver_work').execute({
      caseId: opened.caseId,
      deliverable: JSON.stringify({ headline: 'Developer activity is steady' }),
    });

    const ruledJobs = await sandbox.holdCourt();
    expect(ruledJobs).toHaveLength(1);
    expect(ruledJobs[0]?.status).toBe('ruled-for-worker');
  });
});
