import { completePendingRefund } from '../src/scenarios/runScenario';
import {
  closeChipnetSession,
  openChipnetSession,
  readCaseRecord,
  writeCaseRecord,
} from './chipnetSession';

const PENDING_CASE_ID = 'silent-worker';

async function main(): Promise<void> {
  const session = await openChipnetSession();
  try {
    const pendingRecord = readCaseRecord(PENDING_CASE_ID);
    const currentBlockHeight = await session.provider.getBlockHeight();
    const refundBlockHeight = pendingRecord.terms.refundBlockHeight;
    console.log(`Chain height ${currentBlockHeight}; refund unlocks at ${refundBlockHeight}.`);
    if (currentBlockHeight < refundBlockHeight) {
      console.error(`Not yet: ${refundBlockHeight - currentBlockHeight} more block(s) needed.`);
      process.exitCode = 1;
      return;
    }
    const refundedRecord = await completePendingRefund(pendingRecord, {
      provider: session.provider,
      roster: session.roster,
      network: 'chipnet',
    });
    writeCaseRecord(refundedRecord);
    console.log(`Refund transaction ${refundedRecord.transactions.at(-1)?.transactionId}`);
  } finally {
    await closeChipnetSession(session);
  }
}

main().catch(function reportFailure(failure: unknown) {
  console.error(failure);
  process.exitCode = 1;
});
