import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadAgentConfig, type LoadedAgentConfig } from './agentConfig';
import { createClientTools, createWorkerTools } from './courtAgentTools';
import { toFieldRequirement } from './jobModel';

const SERVER_NAME = 'agentcourt';
const SERVER_VERSION = '0.1.0';

const requiredFieldInputSchema = z.object({
  fieldName: z.string(),
  kind: z.enum(['string', 'number', 'array']),
  minimumLength: z.number().optional().describe('Minimum characters for a string, or items for an array'),
  minimumValue: z.number().optional(),
  maximumValue: z.number().optional(),
});

function asTextResult(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }] };
}

function registerClientTools(server: McpServer, config: LoadedAgentConfig): void {
  const tools = createClientTools(config.provider, config.identity, config.parties, config.jobStore);

  server.registerTool(
    'open_escrow',
    {
      description:
        'Hire the worker agent: lock payment in a Bitcoin Cash covenant. Pass expectedResult when the exact answer is known, so the covenant verifies the work by hash. Otherwise pass requiredFields and a jury will judge the work.',
      inputSchema: {
        title: z.string(),
        summary: z.string().describe('What the worker must deliver'),
        expectedResult: z.string().optional().describe('Exact expected deliverable text; enables the hash check'),
        requiredFields: z.array(requiredFieldInputSchema).optional().describe('Fields a JSON deliverable must contain, for jury review'),
        escrowSatoshis: z.number().int().describe('Payment to lock, at least 3000'),
      },
    },
    async function handleOpenEscrow(input) {
      return asTextResult(
        await tools.openEscrow({
          title: input.title,
          summary: input.summary,
          escrowSatoshis: input.escrowSatoshis,
          ...(input.expectedResult === undefined ? {} : { expectedResult: input.expectedResult }),
          ...(input.requiredFields === undefined ? {} : { requiredFields: input.requiredFields.map(toFieldRequirement) }),
        }),
      );
    },
  );

  server.registerTool(
    'get_escrow',
    { description: 'Read the current state of an escrow you opened.', inputSchema: { caseId: z.string() } },
    async function handleGetEscrow(input) {
      return asTextResult(tools.getEscrow(input.caseId));
    },
  );
}

function registerWorkerTools(server: McpServer, config: LoadedAgentConfig): void {
  const tools = createWorkerTools(config.provider, config.identity, config.jobStore);

  server.registerTool(
    'list_jobs',
    { description: 'List funded jobs waiting for work, with their requirements and the escrow address.', inputSchema: {} },
    async function handleListJobs() {
      return asTextResult(tools.listJobs());
    },
  );

  server.registerTool(
    'deliver_work',
    {
      description:
        'Deliver the result for a job. A hash-checked job pays out immediately if the deliverable matches exactly; a jury job is sent to the court for review.',
      inputSchema: { caseId: z.string(), deliverable: z.string().describe('The deliverable text, at most 600 bytes') },
    },
    async function handleDeliverWork(input) {
      return asTextResult(await tools.deliverWork(input.caseId, input.deliverable));
    },
  );
}

async function main(): Promise<void> {
  const configFilePath = process.env.AGENTCOURT_AGENT_CONFIG;
  if (configFilePath === undefined) {
    throw new Error('AGENTCOURT_AGENT_CONFIG must point at an agent config file');
  }
  const config = await loadAgentConfig(configFilePath);
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  if (config.role === 'client') {
    registerClientTools(server, config);
  } else {
    registerWorkerTools(server, config);
  }
  await server.connect(new StdioServerTransport());
}

main().catch(function reportFailure(failure) {
  process.stderr.write(`agentcourt MCP server failed: ${failure instanceof Error ? failure.message : String(failure)}\n`);
  process.exit(1);
});
