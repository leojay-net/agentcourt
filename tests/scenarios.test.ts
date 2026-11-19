import { MockNetworkProvider, randomUtxo } from 'cashscript';
import { beforeEach, describe, expect, it } from 'vitest';
import { AGENT_ROLES, type AgentRoster } from '../src/core/agentRoster';
import { caseRecordSchema } from '../src/core/caseRecord';
import { generateAgentIdentity } from '../src/core/identity';
import { SCENARIO_DEFINITIONS } from '../src/scenarios/definitions';
import { completePendingRefund, runScenario } from '../src/scenarios/runScenario';

const STARTING_BLOCK_HEIGHT = 500;
const CLIENT_STARTING_BALANCE = 100_000n;

let provider: MockNetworkProvider;
let roster: AgentRoster;

function findDefinition(caseId: string) {
  const definition = SCENARIO_DEFINITIONS.find(function matches(candidate) {
    return candidate.caseId === caseId;
  });
  if (definition === undefined) {
    throw new Error(`Unknown scenario ${caseId}`);
  }
  return definition;
}

beforeEach(function prepareMockNetwork() {
  provider = new MockNetworkProvider();
  provider.setBlockHeight(STARTING_BLOCK_HEIGHT);
  const identitiesByRole: Record<string, ReturnType<typeof generateAgentIdentity>> = {};
  for (const role of AGENT_ROLES) {
    identitiesByRole[role] = generateAgentIdentity(role, 'mocknet');
  }
  roster = identitiesByRole as unknown as AgentRoster;
  provider.addUtxo(roster.client.address, randomUtxo({ satoshis: CLIENT_STARTING_BALANCE }));
});

describe('scenario runner', function describeScenarioRunner() {
  it('settles a deterministic task through the covenant alone', async function () {
    const record = await runScenario(findDefinition('invoice-sort'), {
      provider,
      roster,
      network: 'mocknet',
    });

    expect(record.status).toBe('settled');
    expect(record.verdicts).toHaveLength(0);
    expect(record.transactions.map((transaction) => transaction.kind)).toEqual(['funding', 'settlement']);
    expect(caseRecordSchema.safeParse(record).success).toBe(true);
  });

  it('pays the worker when the jury accepts the brief', async function () {
    const record = await runScenario(findDefinition('market-brief-accepted'), {
      provider,
      roster,
      network: 'mocknet',
    });

    expect(record.status).toBe('ruled-for-worker');
    expect(record.verdicts.every((verdict) => verdict.favoredParty === 'worker')).toBe(true);
    expect(record.transactions.at(-1)?.kind).toBe('ruling');
  });

  it('refunds the client when the jury rejects the brief', async function () {
    const record = await runScenario(findDefinition('market-brief-rejected'), {
      provider,
      roster,
      network: 'mocknet',
    });

    expect(record.status).toBe('ruled-for-client');
    expect(record.verdicts.filter((verdict) => verdict.favoredParty === 'client').length).toBeGreaterThanOrEqual(2);
  });

  it('holds a silent-worker case until the deadline, then refunds the client', async function () {
    const pendingRecord = await runScenario(findDefinition('silent-worker'), {
      provider,
      roster,
      network: 'mocknet',
    });
    expect(pendingRecord.status).toBe('awaiting-deadline');

    await expect(
      completePendingRefund(pendingRecord, { provider, roster, network: 'mocknet' }),
    ).rejects.toThrow();

    provider.setBlockHeight(pendingRecord.terms.refundBlockHeight + 1);
    const refundedRecord = await completePendingRefund(pendingRecord, {
      provider,
      roster,
      network: 'mocknet',
    });
    expect(refundedRecord.status).toBe('refunded');
  });
});
