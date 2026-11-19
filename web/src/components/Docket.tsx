import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import type { CaseRecord } from '../../../src/core/caseRecord';
import { formatSatoshis } from '../lib/format';
import { CaseDetail } from './CaseDetail';
import { StatusBadge } from './StatusBadge';
import type { CaseRecordsState } from '../hooks/useCaseRecords';
import styles from './Docket.module.css';

export function Docket({ recordsState }: { readonly recordsState: CaseRecordsState }) {
  return (
    <section id="docket" className={styles.section}>
      <div className="container">
        <p className="eyebrow">Live on chipnet</p>
        <h2 className={styles.title}>The docket</h2>
        <p className={styles.intro}>
          Every case below was run end to end against real Bitcoin Cash chipnet. Each transaction
          is looked up on the network from your browser, not from this page&apos;s own data.
        </p>
        <DocketBody recordsState={recordsState} />
      </div>
    </section>
  );
}

function DocketBody({ recordsState }: { readonly recordsState: CaseRecordsState }) {
  if (recordsState.status === 'loading') {
    return <div className={styles.placeholder} aria-busy="true">Loading cases</div>;
  }
  if (recordsState.status === 'failed') {
    return (
      <div className={styles.placeholder} role="alert">
        The case records could not be loaded. {recordsState.message}
      </div>
    );
  }
  if (recordsState.records.length === 0) {
    return (
      <div className={styles.placeholder}>
        No cases have been recorded yet. Run the chipnet demo to fill the docket.
      </div>
    );
  }
  return <CaseBrowser records={recordsState.records} />;
}

function CaseBrowser({ records }: { readonly records: readonly CaseRecord[] }) {
  const [selectedCaseId, setSelectedCaseId] = useState(records[0]?.caseId ?? '');
  const selectedRecord =
    records.find(function matchesSelection(record) {
      return record.caseId === selectedCaseId;
    }) ?? records[0];

  return (
    <div className={styles.browser}>
      <ul className={styles.list} aria-label="Cases">
        {records.map(function renderCase(record) {
          const isSelected = record.caseId === selectedRecord?.caseId;
          return (
            <li key={record.caseId}>
              <button
                type="button"
                className={styles.caseButton}
                aria-pressed={isSelected}
                onClick={function selectCase() {
                  setSelectedCaseId(record.caseId);
                }}
              >
                {isSelected ? (
                  <motion.span
                    layoutId="docket-selection"
                    className={styles.selection}
                    transition={{ type: 'spring', stiffness: 480, damping: 42 }}
                  />
                ) : null}
                <span className={styles.caseContent}>
                  <span className={styles.caseTitle}>{record.title}</span>
                  <span className={styles.caseMeta}>
                    <StatusBadge status={record.status} />
                    <span className="tabular">{formatSatoshis(record.escrowSatoshis)} sats</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div>
        <AnimatePresence mode="wait" initial={false}>
          {selectedRecord === undefined ? null : <CaseDetail key={selectedRecord.caseId} record={selectedRecord} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
