import { useRef, useState } from 'react';
import type { JobFile } from '../../../src/agent/jobModel';
import { createCourtSandbox, createMainnetCourt, type CourtWorld } from '../agent/courtSandbox';
import { DEFAULT_MODEL_SETTINGS, ModelRequestError, runToolLoop, type AgentEvent, type AgentTool, type ModelSettings } from '../agent/modelClient';
import { sendFromWallet } from '../wallet/walletTransfer';
import { useWizardWallet } from '../wallet/useWizardWallet';
import { ActionButton } from './Button';
import { ModelSettingsForm } from './ModelSettingsForm';
import { SessionTrace, type TraceEntry } from './SessionTrace';
import { WalletPanel, shortenAddress } from './WalletPanel';
import styles from './AgentConsole.module.css';

const DEFAULT_CLIENT_TASK = [
  'Open two escrows to hire the worker agent, each paying 3000 satoshis.',
  '1. Sort these twelve invoice totals in ascending order: 1250, 310, 1600, 120, 775, 520, 185, 1020, 415, 890, 240, 640. You know the correct answer, so pass expectedResult exactly as this JSON array text: [120,185,240,310,415,520,640,775,890,1020,1250,1600]',
  '2. A short sourced market brief on Bitcoin Cash developer activity, delivered as a JSON object. You cannot predict the text, so do not pass expectedResult; require fields headline (string, at least 12 characters), body (string, at least 120 characters), sources (array, at least 2 items) and confidence (number from 0 to 1). Say in the summary that the deliverable must stay under 600 bytes.',
  'Then give a one-paragraph report of the two escrows you opened.',
].join('\n');

const MAINNET_CLIENT_TASK = [
  'Open one escrow to hire the worker agent, paying 3000 satoshis.',
  'Sort these six invoice totals in ascending order: 640, 120, 415, 1020, 185, 775. You know the correct answer, so pass expectedResult exactly as this JSON array text: [120,185,415,640,775,1020]',
  'Then give a one-paragraph report of the escrow you opened.',
].join('\n');

const MAINNET_FUNDING_CHOICES_SATOSHIS = [8_000, 10_000, 15_000] as const;
const EXPLORER_TRANSACTION_URL = 'https://blockchair.com/bitcoin-cash/transaction/';

type NetworkMode = 'simulated' | 'mainnet';
type FundingStatus = 'idle' | 'sending' | 'sent';

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
  const [mode, setMode] = useState<NetworkMode>('simulated');
  const wallet = useWizardWallet('AgentCourt');
  const mainnetCourtRef = useRef<ReturnType<typeof createMainnetCourt> | null>(null);
  const [fundingChoice, setFundingChoice] = useState<number>(MAINNET_FUNDING_CHOICES_SATOSHIS[1]);
  const [fundingStatus, setFundingStatus] = useState<FundingStatus>('idle');
  const [fundingTransactionId, setFundingTransactionId] = useState<string | null>(null);
  const [returnTransactionIds, setReturnTransactionIds] = useState<string[]>([]);
  const [isReturningFunds, setIsReturningFunds] = useState(false);
  const nextEntryIdentifier = useRef(0);

  const isRunning = phase === 'client' || phase === 'worker' || phase === 'court';
  const isMainnet = mode === 'mainnet';
  const canRun =
    settings.apiKey.trim() !== '' && clientTask.trim() !== '' && !isRunning && (!isMainnet || fundingStatus === 'sent');

  function appendEntry(stage: string, event: AgentEvent): void {
    nextEntryIdentifier.current += 1;
    const entry: TraceEntry = { identifier: nextEntryIdentifier.current, stage, event };
    setEntries(function addEntry(current) {
      return [...current, entry];
    });
  }

  async function runAgent(sandbox: CourtWorld, stage: string, roleDescription: string, task: string, tools: readonly AgentTool[], signal: AbortSignal): Promise<void> {
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
    const sandbox = isMainnet ? obtainMainnetCourt().world : createCourtSandbox();
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

  function obtainMainnetCourt(): ReturnType<typeof createMainnetCourt> {
    mainnetCourtRef.current ??= createMainnetCourt();
    return mainnetCourtRef.current;
  }

  function chooseMode(nextMode: NetworkMode): void {
    if (isRunning) return;
    setMode(nextMode);
    setClientTask(nextMode === 'mainnet' ? MAINNET_CLIENT_TASK : DEFAULT_CLIENT_TASK);
    setEntries([]);
    setJobs([]);
    setFailureMessage(null);
    setPhase('idle');
  }

  async function fundAgents(): Promise<void> {
    if (wallet.manager === null) return;
    const mainnetCourt = obtainMainnetCourt();
    setFailureMessage(null);
    setFundingStatus('sending');
    try {
      const receipt = await sendFromWallet({
        manager: wallet.manager,
        provider: mainnetCourt.provider,
        toAddress: mainnetCourt.world.clientAddress,
        satoshis: BigInt(fundingChoice),
        userPrompt: `Fund the AgentCourt client agent with ${fundingChoice.toLocaleString('en-US')} sats`,
      });
      setFundingTransactionId(receipt.transactionId);
      setFundingStatus('sent');
    } catch (failure) {
      setFundingStatus('idle');
      setFailureMessage(explainFailure(failure));
    }
  }

  async function returnFundsToWallet(): Promise<void> {
    if (wallet.address === null || mainnetCourtRef.current === null) return;
    setIsReturningFunds(true);
    try {
      setReturnTransactionIds(await mainnetCourtRef.current.world.returnFundsTo(wallet.address));
    } catch (failure) {
      setFailureMessage(explainFailure(failure));
    } finally {
      setIsReturningFunds(false);
    }
  }

  function downloadSessionKeys(): void {
    if (mainnetCourtRef.current === null) return;
    const blob = new Blob([mainnetCourtRef.current.exportKeys()], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'agentcourt-session-keys.json';
    link.click();
    URL.revokeObjectURL(link.href);
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
          against a private simulated court, or against real Bitcoin Cash mainnet funded from your wallet. The covenants
          are the real scripts, so a payout the contract forbids fails here exactly as it would on chain.
        </p>

        <div className={styles.layout}>
          <form
            className={styles.controls}
            onSubmit={function submit(event) {
              event.preventDefault();
              if (canRun) void runSession();
            }}
          >
            <div className={styles.modeSwitch} role="group" aria-label="Network">
              <button type="button" data-active={!isMainnet} disabled={isRunning} onClick={function simulated() { chooseMode('simulated'); }}>
                Simulated, free
              </button>
              <button type="button" data-active={isMainnet} disabled={isRunning} onClick={function mainnet() { chooseMode('mainnet'); }}>
                Bitcoin Cash mainnet
              </button>
            </div>
            {isMainnet ? (
              <div className={styles.mainnet}>
                <p className={styles.mainnetNote}>
                  Real money, a few cents. Your wallet funds a client agent key made in this page. Its agents open a real escrow,
                  the worker settles it, and you can send what is left back to your wallet. Download the session keys first if
                  you may close the tab.
                </p>
                <WalletPanel wallet={wallet} />
                <div className={styles.fundingRow}>
                  <label className={styles.field}>
                    <span>Fund the client agent</span>
                    <select
                      className={styles.select}
                      value={fundingChoice}
                      disabled={fundingStatus !== 'idle'}
                      onChange={function onFundingChange(event) {
                        setFundingChoice(Number(event.target.value));
                      }}
                    >
                      {MAINNET_FUNDING_CHOICES_SATOSHIS.map(function renderChoice(choice) {
                        return (
                          <option key={choice} value={choice}>
                            {choice.toLocaleString('en-US')} sats
                          </option>
                        );
                      })}
                    </select>
                  </label>
                  <ActionButton
                    type="button"
                    variant="secondary"
                    isLoading={fundingStatus === 'sending'}
                    disabled={!wallet.isReady || fundingStatus !== 'idle'}
                    onClick={function fund() { void fundAgents(); }}
                  >
                    {fundingStatus === 'sent' ? 'Funded' : 'Send from wallet'}
                  </ActionButton>
                </div>
                {fundingTransactionId === null ? null : (
                  <p className={styles.mainnetNote}>
                    Funding transaction{' '}
                    <a href={`${EXPLORER_TRANSACTION_URL}${fundingTransactionId}`} target="_blank" rel="noreferrer">
                      {shortenAddress(fundingTransactionId)}
                    </a>
                  </p>
                )}
                <button type="button" className={styles.linkButton} onClick={downloadSessionKeys}>
                  Download session keys
                </button>
              </div>
            ) : null}
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
            {isMainnet && phase === 'done' ? (
              <div className={styles.returnRow}>
                <ActionButton type="button" variant="secondary" isLoading={isReturningFunds} onClick={function sendBack() { void returnFundsToWallet(); }}>
                  Return leftover funds to my wallet
                </ActionButton>
                {returnTransactionIds.map(function renderReturn(transactionId) {
                  return (
                    <a key={transactionId} href={`${EXPLORER_TRANSACTION_URL}${transactionId}`} target="_blank" rel="noreferrer">
                      {shortenAddress(transactionId)}
                    </a>
                  );
                })}
              </div>
            ) : null}
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
