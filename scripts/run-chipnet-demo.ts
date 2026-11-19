import { MINIMUM_ESCROW_SATOSHIS } from '../src/core/constants';
import { SCENARIO_DEFINITIONS } from '../src/scenarios/definitions';
import { runScenario } from '../src/scenarios/runScenario';
import { closeChipnetSession, openChipnetSession, writeCaseRecord } from './chipnetSession';

/** Per scenario: the escrow plus funding, spend and change-output fees, with margin. */
const FEE_ALLOWANCE_PER_SCENARIO_SATOSHIS = 2_500n;

async function main(): Promise<void> {
  const session = await openChipnetSession();
  try {
    const { provider, roster } = session;
    const clientUtxos = await provider.getUtxos(roster.client.address);
    const clientBalance = clientUtxos.reduce(function addValue(total, utxo) {
      return total + utxo.satoshis;
    }, 0n);

    const requiredBalance = SCENARIO_DEFINITIONS.reduce(function addRequirement(total, definition) {
      return total + definition.escrowSatoshis + FEE_ALLOWANCE_PER_SCENARIO_SATOSHIS;
    }, 0n);

    console.log(`Client ${roster.client.address} holds ${clientBalance} satoshis (needs about ${requiredBalance}).`);
    if (clientBalance < requiredBalance || requiredBalance < MINIMUM_ESCROW_SATOSHIS) {
      console.error('Fund the client address from the chipnet faucet at https://tbch.googol.cash, then re-run.');
      process.exitCode = 1;
      return;
    }

    for (const definition of SCENARIO_DEFINITIONS) {
      console.log(`Running ${definition.caseId} ...`);
      const record = await runScenario(definition, { provider, roster, network: 'chipnet' });
      writeCaseRecord(record);
      for (const transaction of record.transactions) {
        console.log(`  ${transaction.kind.padEnd(10)} ${transaction.transactionId}`);
      }
    }
  } finally {
    await closeChipnetSession(session);
  }
}

main().catch(function reportFailure(failure: unknown) {
  console.error(failure);
  process.exitCode = 1;
});
