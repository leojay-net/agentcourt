import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ElectrumNetworkProvider, Network } from 'cashscript';
import { createJobStore } from '../src/agent/jobStore';
import { ruleOnSubmittedJob } from '../src/agent/courtService';
import { parseRosterFile, type AgentRoster } from '../src/core/agentRoster';
import { exportPrivateKeyHex } from '../src/core/identity';

const PROJECT_ROOT = resolve(import.meta.dirname, '..');
const ROSTER_FILE_PATH = resolve(PROJECT_ROOT, '.keys/chipnet-agents.json');
const JOB_DIRECTORY = resolve(PROJECT_ROOT, '.keys/jobs');
const TRANSCRIPT_PATH = resolve(PROJECT_ROOT, 'demo/agent-session.json');

const INFERENCE_URL = 'https://api.vultrinference.com/v1/chat/completions';
const INFERENCE_MODEL = 'deepseek-v4.1-flash-1017';
const MAXIMUM_AGENT_STEPS = 10;

type Actor = 'client-agent' | 'worker-agent' | 'court';

interface TranscriptEvent {
  readonly actor: Actor;
  readonly kind: 'task' | 'agent-says' | 'tool-call' | 'tool-result' | 'court-ruling';
  readonly text: string;
  readonly toolName?: string;
  readonly transactionIds?: readonly string[];
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

const UNSORTED_TOTALS = [1250, 310, 1600, 120, 775, 520, 185, 1020, 415, 890, 240, 640];
const SORTED_TOTALS_TEXT = JSON.stringify([...UNSORTED_TOTALS].sort(function ascending(first, second) {
  return first - second;
}));

const CLIENT_TASK = [
  'Open two escrows to hire the worker agent, each paying 3000 satoshis.',
  `1. Sort these twelve invoice totals in ascending order: ${UNSORTED_TOTALS.join(', ')}. You know the correct answer, so pass expectedResult exactly as this JSON array text: ${SORTED_TOTALS_TEXT}`,
  '2. A short sourced market brief on Bitcoin Cash developer activity, delivered as a JSON object. You cannot predict the text, so do not pass expectedResult; require fields headline (string, at least 12 characters), body (string, at least 120 characters), sources (array, at least 2 items) and confidence (number from 0 to 1). Say in the summary that the deliverable must stay under 600 bytes.',
  'Then give a one-paragraph report of the two escrows you opened.',
].join('\n');

const WORKER_TASK =
  'Call list_jobs, then do every job and deliver each result with deliver_work. Deliver the work exactly as the job asks, with no extra text. Then give a one-paragraph report.';

function systemPromptFor(roleDescription: string): string {
  return `You are ${roleDescription} on a Bitcoin Cash escrow service. Use the tools you are given; do not invent results. If a tool call fails, say why in one sentence.`;
}

function readInferenceKey(): string {
  const keyFileContents = readFileSync(resolve(PROJECT_ROOT, '../../.vultr.env'), 'utf-8');
  const keyLine = keyFileContents.split('\n').find(function isKeyLine(line) {
    return line.startsWith('VULTR_INFERENCE_API_KEY=');
  });
  const apiKey = keyLine?.split('=')[1]?.trim();
  if (apiKey === undefined || apiKey === '') {
    throw new Error('VULTR_INFERENCE_API_KEY is missing from .vultr.env');
  }
  return apiKey;
}

async function requestChatCompletion(apiKey: string, messages: ChatMessage[], tools: unknown[]): Promise<ChatMessage> {
  const response = await fetch(INFERENCE_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: INFERENCE_MODEL, messages, tools, temperature: 0 }),
  });
  if (!response.ok) {
    throw new Error(`Inference request failed (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
  const body = (await response.json()) as { choices: { message: ChatMessage }[] };
  const message = body.choices[0]?.message;
  if (message === undefined) {
    throw new Error('Inference response had no message');
  }
  return message;
}

function recordEvent(transcript: TranscriptEvent[], event: TranscriptEvent): void {
  transcript.push(event);
  console.log(`[${event.actor} ${event.kind}${event.toolName ? ` ${event.toolName}` : ''}] ${event.text}`);
}

function extractTransactionIds(resultText: string): string[] {
  return [...resultText.matchAll(/"(?:fundingTransactionId|settlementTransactionId|transactionId)":"([0-9a-f]{64})"/g)].map(
    function captureId(match) {
      return match[1] as string;
    },
  );
}

function writeAgentConfig(role: 'client' | 'worker', roster: AgentRoster): string {
  const configPath = resolve(PROJECT_ROOT, `.keys/agent-config-${role}.json`);
  const identity = role === 'client' ? roster.client : roster.worker;
  writeFileSync(
    configPath,
    JSON.stringify({
      role,
      privateKeyHex: exportPrivateKeyHex(identity),
      jobDirectory: JOB_DIRECTORY,
      parties: {
        clientPublicKeyHashHex: Buffer.from(roster.client.publicKeyHash).toString('hex'),
        workerPublicKeyHashHex: Buffer.from(roster.worker.publicKeyHash).toString('hex'),
        jurorPublicKeysHex: [roster.jurorOne, roster.jurorTwo, roster.jurorThree].map(function toHex(juror) {
          return Buffer.from(juror.publicKey).toString('hex');
        }),
      },
    }),
    { mode: 0o600 },
  );
  return configPath;
}

async function runAgent(
  actor: Actor,
  role: 'client' | 'worker',
  roster: AgentRoster,
  apiKey: string,
  roleDescription: string,
  task: string,
  transcript: TranscriptEvent[],
): Promise<void> {
  const mcpClient = new Client({ name: `${role}-agent`, version: '0.1.0' });
  await mcpClient.connect(
    new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'src/agent/mcpServer.ts'],
      cwd: PROJECT_ROOT,
      env: { ...(process.env as Record<string, string>), AGENTCOURT_AGENT_CONFIG: writeAgentConfig(role, roster) },
    }),
  );
  const chatTools = (await mcpClient.listTools()).tools.map(function toChatTool(tool) {
    return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } };
  });

  recordEvent(transcript, { actor, kind: 'task', text: task });
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPromptFor(roleDescription) },
    { role: 'user', content: task },
  ];
  for (let stepNumber = 1; stepNumber <= MAXIMUM_AGENT_STEPS; stepNumber += 1) {
    const reply = await requestChatCompletion(apiKey, messages, chatTools);
    messages.push({ role: 'assistant', content: reply.content ?? null, ...(reply.tool_calls ? { tool_calls: reply.tool_calls } : {}) });
    if (reply.content) {
      recordEvent(transcript, { actor, kind: 'agent-says', text: reply.content });
    }
    if (!reply.tool_calls || reply.tool_calls.length === 0) {
      break;
    }
    for (const toolCall of reply.tool_calls) {
      const toolArguments = JSON.parse(toolCall.function.arguments || '{}') as Record<string, unknown>;
      recordEvent(transcript, { actor, kind: 'tool-call', toolName: toolCall.function.name, text: JSON.stringify(toolArguments) });
      const toolResponse = await mcpClient.callTool({ name: toolCall.function.name, arguments: toolArguments });
      const resultText = (toolResponse.content as { text: string }[])[0]?.text ?? '';
      const transactionIds = extractTransactionIds(resultText);
      recordEvent(transcript, {
        actor,
        kind: 'tool-result',
        toolName: toolCall.function.name,
        text: resultText,
        ...(transactionIds.length > 0 ? { transactionIds } : {}),
      });
      messages.push({ role: 'tool', tool_call_id: toolCall.id, content: resultText });
    }
  }
  await mcpClient.close();
}

async function main(): Promise<void> {
  const roster = parseRosterFile(readFileSync(ROSTER_FILE_PATH, 'utf-8'), 'chipnet');
  const apiKey = readInferenceKey();
  rmSync(JOB_DIRECTORY, { recursive: true, force: true });
  const jobStore = createJobStore(JOB_DIRECTORY);
  const transcript: TranscriptEvent[] = [];

  await runAgent('client-agent', 'client', roster, apiKey, 'the client agent that hires other agents', CLIENT_TASK, transcript);
  await runAgent('worker-agent', 'worker', roster, apiKey, 'the worker agent that takes paid jobs', WORKER_TASK, transcript);

  const provider = new ElectrumNetworkProvider(Network.CHIPNET, { manualConnectionManagement: true });
  await provider.connect();
  try {
    for (const job of jobStore.list()) {
      if (job.status !== 'submitted-to-court') {
        continue;
      }
      const ruledJob = await ruleOnSubmittedJob(provider, roster, jobStore, job.caseId);
      const verdictLines = ruledJob.verdicts.map(function describeVerdict(verdict) {
        return `${verdict.jurorLabel}: ${verdict.favoredParty} (${verdict.reasoning})`;
      });
      recordEvent(transcript, {
        actor: 'court',
        kind: 'court-ruling',
        text: `${ruledJob.title}: ${ruledJob.status}\n${verdictLines.join('\n')}`,
        ...(ruledJob.rulingTransactionId ? { transactionIds: [ruledJob.rulingTransactionId] } : {}),
      });
    }
  } finally {
    await provider.disconnect();
  }

  mkdirSync(dirname(TRANSCRIPT_PATH), { recursive: true });
  writeFileSync(TRANSCRIPT_PATH, JSON.stringify({ jobs: jobStore.list(), events: transcript }, null, 2));
  console.log(`Transcript written to ${TRANSCRIPT_PATH}`);
}

main().catch(function reportFailure(failure) {
  console.error(failure);
  process.exit(1);
});
