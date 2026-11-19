import { useRef, useState } from 'react';
import type { JobFile } from '../../../src/agent/jobModel';
import { createCourtSandbox, type CourtSandbox } from '../agent/courtSandbox';
import { DEFAULT_MODEL_SETTINGS, ModelRequestError, runToolLoop, type AgentEvent, type AgentTool, type ModelSettings } from '../agent/modelClient';
import { ActionButton } from './Button';
import { ModelSettingsForm } from './ModelSettingsForm';
import { SessionTrace, type TraceEntry } from './SessionTrace';
import styles from './AgentConsole.module.css';

const DEFAULT_CLIENT_TASK = [
  'Open two escrows to hire the worker agent, each paying 3000 satoshis.',
  '1. Sort these twelve invoice totals in ascending order: 1250, 310, 1600, 120, 775, 520, 185, 1020, 415, 890, 240, 640. You know the correct answer, so pass expectedResult exactly as this JSON array text: [120,185,240,310,415,520,640,775,890,1020,1250,1600]',
  '2. A short sourced market brief on Bitcoin Cash developer activity, delivered as a JSON object. You cannot predict the text, so do not pass expectedResult; require fields headline (string, at least 12 characters), body (string, at least 120 characters), sources (array, at least 2 items) and confidence (number from 0 to 1). Say in the summary that the deliverable must stay under 600 bytes.',
  'Then give a one-paragraph report of the two escrows you opened.',
].join('\n');

const WORKER_TASK =
  'Call list_jobs, then do every job and deliver each result with deliver_work. Deliver the work exactly as the job asks, with no extra text. Then give a one-paragraph report.';

const SYSTEM_PROMPT = (roleDescription: string): string =>
  `You are ${roleDescription} on a Bitcoin Cash escrow service. Use the tools you are given; do not invent results. If a tool call fails, say why in one sentence.`;

const JOB_STATUS_LABELS: Readonly<Record<JobFile['status'], string>> = {
  open: 'Funded, waiting for work',
  settled: 'Settled by code',
  'submitted-to-court': 'With the court',
  'ruled-for-worker': 'Jury paid worker',
  'ruled-for-client': 'Jury refunded client',
};

type SessionPhase = 'idle' | 'client' | 'worker' | 'court' | 'done' | 'failed';

const PHASE_LABELS: Readonly<Record<SessionPhase, string>> = {
  idle: 'Ready',
  client: 'Client agent working',
  worker: 'Worker agent working',
  court: 'Court deliberating',
  done: 'Finished',
  failed: 'Stopped',
};

function summarizeRuling(job: JobFile): string {
  const votesForWorker = job.verdicts.filter(function favorsWorker(verdict) {
    return verdict.favoredParty === 'worker';
  }).length;
  const winner = job.status === 'ruled-for-worker' ? 'the worker' : 'the client';
  const reasons = job.verdicts.map(function describeVerdict(verdict) {
    return `${verdict.jurorLabel}: ${verdict.favoredParty} (${verdict.reasoning})`;
  });
  return [`${job.title}: ${votesForWorker} of ${job.verdicts.length} jurors for the worker, paid to ${winner}.`, ...reasons].join('\n');
}

function explainFailure(failure: unknown): string {
  if (failure instanceof ModelRequestError) return failure.message;
  return failure instanceof Error ? failure.message : 'The session stopped unexpectedly.';
}

export function AgentConsole() {
  const [settings, setSettings] = useState<ModelSettings>(DEFAULT_MODEL_SETTINGS);
  const [clientTask, setClientTask] = useState(DEFAULT_CLIENT_TASK);
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [entries, setEntries] = useState<TraceEntry[]>([]);
  const [jobs, setJobs] = useState<JobFile[]>([]);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const nextEntryIdentifier = useRef(0);

  const isRunning = phase === 'client' || phase === 'worker' || phase === 'court';
  const canRun = settings.apiKey.trim() !== '' && clientTask.trim() !== '' && !isRunning;

  function appendEntry(stage: string, event: AgentEvent): void {
    nextEntryIdentifier.current += 1;
    const entry: TraceEntry = { identifier: nextEntryIdentifier.current, stage, event };
    setEntries(function addEntry(current) {
      return [...current, entry];
    });
  }

  async function runAgent(sandbox: CourtSandbox, stage: string, roleDescription: string, task: string, tools: readonly AgentTool[], signal: AbortSignal): Promise<void> {
    await runToolLoop({
      settings,
      systemPrompt: SYSTEM_PROMPT(roleDescription),
      task,
      tools,
      signal,
      onEvent(event) {
        appendEntry(stage, event);
        if (event.kind === 'tool-result') setJobs(sandbox.listJobs());
      },
    });
  }

  async function runSession(): Promise<void> {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const { signal } = abortController;
    const sandbox = createCourtSandbox();
    setEntries([]);
    setJobs([]);
    setFailureMessage(null);
    try {
      setPhase('client');
      await runAgent(sandbox, 'Client', 'a client agent hiring a worker agent', clientTask, sandbox.clientTools, signal);
      setPhase('worker');
      await runAgent(sandbox, 'Worker', 'a worker agent that completes jobs for pay', WORKER_TASK, sandbox.workerTools, signal);
      setPhase('court');
      const ruledJobs = await sandbox.holdCourt();
      for (const ruledJob of ruledJobs) appendEntry('Court', { kind: 'agent-says', text: summarizeRuling(ruledJob) });
      setJobs(sandbox.listJobs());
      setPhase('done');
    } catch (failure) {
      if (signal.aborted) {
        setPhase('idle');
        return;
      }
      setFailureMessage(explainFailure(failure));
      setPhase('failed');
    }
  }

  function stopSession(): void {
    abortControllerRef.current?.abort();
  }

  return (
    <section id="agent" className={styles.section}>
      <div className="container">
        <p className="eyebrow">Use it from the browser</p>
        <h2 className={styles.title}>Run the agents here</h2>
        <p className={styles.intro}>
          No agent system of your own? Give a model a key and the same four tools the MCP server exposes run in this tab,
          against a private simulated court. The covenants are the real scripts, so a payout the contract forbids fails
          here exactly as it would on chipnet. Only the network and the keys are throwaway.
        </p>

        <div className={styles.layout}>
          <form
            className={styles.controls}
            onSubmit={function submit(event) {
              event.preventDefault();
              if (canRun) void runSession();
            }}
          >
            <label className={styles.field}>
              <span>Brief for the client agent</span>
              <textarea
                className={styles.textarea}
                rows={9}
                value={clientTask}
                disabled={isRunning}
                onChange={function onTaskChange(event) {
                  setClientTask(event.target.value);
                }}
              />
            </label>
            <ModelSettingsForm settings={settings} onChange={setSettings} isDisabled={isRunning} />
            <div className={styles.actions}>
              <ActionButton type="submit" isLoading={isRunning} disabled={!canRun}>
                {isRunning ? PHASE_LABELS[phase] : 'Run the session'}
              </ActionButton>
              {isRunning ? (
                <ActionButton type="button" variant="quiet" onClick={stopSession}>
                  Stop
                </ActionButton>
              ) : null}
            </div>
            {failureMessage === null ? null : (
              <p className={styles.failure} role="alert">
                {failureMessage}
              </p>
            )}
          </form>

          <div className={styles.session}>
            <div className={styles.board}>
              <div className={styles.boardHeader}>
                <h3>Escrow board</h3>
                <span className={styles.phase} data-phase={phase}>
                  {PHASE_LABELS[phase]}
                </span>
              </div>
              {jobs.length === 0 ? (
                <p className={styles.boardEmpty}>No escrows yet. The client agent opens them.</p>
              ) : (
                <ul className={styles.jobList}>
                  {jobs.map(function renderJob(job) {
                    return (
                      <li key={job.caseId} className={styles.job} data-status={job.status}>
                        <span className={styles.jobTitle}>{job.title}</span>
                        <span className={styles.jobMeta}>
                          {job.escrowSatoshis.toLocaleString('en-US')} sats, {job.mode === 'hash-check' ? 'hash check' : 'jury'}
                        </span>
                        <span className={styles.jobStatus}>{JOB_STATUS_LABELS[job.status]}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <SessionTrace entries={entries} />
          </div>
        </div>

        <div className={styles.connect}>
          <div>
            <h3>Prefer your own agent?</h3>
            <p>
              Connect Claude Desktop, Claude Code, or any MCP client. It runs the same tools against real chipnet funds,
              with its own key and nothing else.
            </p>
          </div>
          <pre className={styles.snippet}>{`{ "mcpServers": { "agentcourt": {
    "command": "npm", "args": ["run", "agent:mcp"],
    "env": { "AGENTCOURT_AGENT_CONFIG": "./agent.json" } } } }`}</pre>
        </div>
      </div>
    </section>
  );
}
