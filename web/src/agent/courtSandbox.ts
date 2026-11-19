import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { z } from 'zod';
import { createClientTools, createWorkerTools, type EscrowParties } from '../../../src/agent/courtAgentTools';
import { ruleOnSubmittedJob } from '../../../src/agent/courtService';
import { createMemoryJobStore, toFieldRequirement, type JobFile, type JobStore } from '../../../src/agent/jobModel';
import { AGENT_ROLES, type AgentRoster } from '../../../src/core/agentRoster';
import { generateAgentIdentity } from '../../../src/core/identity';
import type { AgentTool } from './modelClient';

const CLIENT_FUNDS_SATOSHIS = 100_000n;
const MINIMUM_ESCROW_SATOSHIS = 3_000;
const SANDBOX_NETWORK = 'mocknet';

const requiredFieldSchema = z.object({
  fieldName: z.string(),
  kind: z.enum(['string', 'number', 'array']),
  minimumLength: z.number().optional(),
  minimumValue: z.number().optional(),
  maximumValue: z.number().optional(),
});

const openEscrowSchema = z.object({
  title: z.string(),
  summary: z.string().describe('What the worker must deliver'),
  expectedResult: z.string().optional().describe('Exact expected deliverable text; enables the hash check'),
  requiredFields: z.array(requiredFieldSchema).optional().describe('Fields a JSON deliverable must contain, for jury review'),
  escrowSatoshis: z.number().int().describe(`Payment to lock, at least ${MINIMUM_ESCROW_SATOSHIS}`),
});
const getEscrowSchema = z.object({ caseId: z.string() });
const deliverWorkSchema = z.object({
  caseId: z.string(),
  deliverable: z.string().describe('The deliverable text, at most 600 bytes'),
});

export interface CourtSandbox {
  readonly jobStore: JobStore;
  readonly clientTools: readonly AgentTool[];
  readonly workerTools: readonly AgentTool[];
  readonly clientFundsSatoshis: bigint;
  listJobs(): JobFile[];
  /** Convenes the jury for every job a worker sent to court, and returns the jobs it ruled on. */
  holdCourt(): Promise<JobFile[]>;
}

function createRoster(): AgentRoster {
  const identities: Partial<Record<(typeof AGENT_ROLES)[number], ReturnType<typeof generateAgentIdentity>>> = {};
  for (const role of AGENT_ROLES) {
    identities[role] = generateAgentIdentity(role, SANDBOX_NETWORK);
  }
  return identities as AgentRoster;
}

/**
 * A private court on a simulated network. The real covenants run in this tab,
 * so a forbidden payout fails exactly as it would on chipnet; only the
 * network and the keys are throwaway.
 */
export function createCourtSandbox(): CourtSandbox {
  const provider = new MockNetworkProvider();
  const roster = createRoster();
  provider.addUtxo(roster.client.address, randomUtxo({ satoshis: CLIENT_FUNDS_SATOSHIS }));
  const jobStore = createMemoryJobStore();
  const parties: EscrowParties = {
    clientPublicKeyHash: roster.client.publicKeyHash,
    workerPublicKeyHash: roster.worker.publicKeyHash,
    jurorPublicKeys: [roster.jurorOne.publicKey, roster.jurorTwo.publicKey, roster.jurorThree.publicKey],
  };
  const clientApi = createClientTools(provider, roster.client, parties, jobStore);
  const workerApi = createWorkerTools(provider, roster.worker, jobStore);

  const clientTools: AgentTool[] = [
    {
      name: 'open_escrow',
      description:
        'Hire the worker agent: lock payment in a Bitcoin Cash covenant. Pass expectedResult when the exact answer is known, so the covenant verifies the work by hash. Otherwise pass requiredFields and a jury will judge the work.',
      parameters: z.toJSONSchema(openEscrowSchema),
      async execute(toolArguments) {
        const input = openEscrowSchema.parse(toolArguments);
        return clientApi.openEscrow({
          title: input.title,
          summary: input.summary,
          escrowSatoshis: input.escrowSatoshis,
          ...(input.expectedResult === undefined ? {} : { expectedResult: input.expectedResult }),
          ...(input.requiredFields === undefined ? {} : { requiredFields: input.requiredFields.map(toFieldRequirement) }),
        });
      },
    },
    {
      name: 'get_escrow',
      description: 'Read the current state of an escrow you opened.',
      parameters: z.toJSONSchema(getEscrowSchema),
      async execute(toolArguments) {
        return clientApi.getEscrow(getEscrowSchema.parse(toolArguments).caseId);
      },
    },
  ];

  const workerTools: AgentTool[] = [
    {
      name: 'list_jobs',
      description: 'List funded jobs waiting for work, with their requirements and the escrow address.',
      parameters: { type: 'object', properties: {} },
      async execute() {
        return workerApi.listJobs();
      },
    },
    {
      name: 'deliver_work',
      description:
        'Deliver the result for a job. A hash-checked job pays out immediately if the deliverable matches exactly; a jury job is sent to the court for review.',
      parameters: z.toJSONSchema(deliverWorkSchema),
      async execute(toolArguments) {
        const input = deliverWorkSchema.parse(toolArguments);
        return workerApi.deliverWork(input.caseId, input.deliverable);
      },
    },
  ];

  async function holdCourt(): Promise<JobFile[]> {
    const ruledJobs: JobFile[] = [];
    for (const job of jobStore.list()) {
      if (job.status === 'submitted-to-court') {
        ruledJobs.push(await ruleOnSubmittedJob(provider, roster, jobStore, job.caseId));
      }
    }
    return ruledJobs;
  }

  return { jobStore, clientTools, workerTools, clientFundsSatoshis: CLIENT_FUNDS_SATOSHIS, listJobs: jobStore.list, holdCourt };
}
