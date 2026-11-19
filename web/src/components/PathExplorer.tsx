import { AnimatePresence, motion } from 'motion/react';
import { useId, useState } from 'react';
import { CourtDiagram, type CourtPath } from './CourtDiagram';
import { CheckIcon } from './Icons';
import styles from './PathExplorer.module.css';

interface PathDescription {
  readonly id: CourtPath;
  readonly label: string;
  readonly headline: string;
  readonly summary: string;
  readonly conditions: readonly string[];
}

const PATH_DESCRIPTIONS: readonly PathDescription[] = [
  {
    id: 'settle',
    label: 'Settle',
    headline: 'Code checks the work',
    summary:
      'When the client funds the escrow it commits to the SHA-256 of the correct result. The worker reveals the deliverable in the spending transaction and the script compares hashes. No approval step exists for the client to withhold.',
    conditions: [
      'sha256(deliverable) equals the committed acceptance hash',
      'The worker key signs the transaction',
      'One output pays the worker, with a miner fee capped at 2,000 sats',
      'Any CashToken balance moves with the payout, unchanged',
    ],
  },
  {
    id: 'rule',
    label: 'Rule',
    headline: 'A jury decides what a hash cannot',
    summary:
      'Two of three juror keys sign a payout transaction. A signature commits to the outputs, so signing a transaction that pays the worker is a vote for the worker. The contract only allows the payout to go to one of the two parties.',
    conditions: [
      'Two of the three juror signatures verify (OP_CHECKMULTISIG)',
      'Output zero pays either the client or the worker, nobody else',
      'No extra outputs and no fee skimming',
      'A single juror, or the same juror twice, cannot move funds',
    ],
  },
  {
    id: 'refund',
    label: 'Refund',
    headline: 'Silence costs the worker the job',
    summary:
      'Past the refund block height the client reclaims the escrow alone. No jury, no counterparty and no server is involved, so a worker that disappears cannot lock funds.',
    conditions: [
      'The transaction locktime is at or after the refund block height',
      'The client key signs the transaction',
      'The escrow returns to the client address in full, less the fee cap',
      'Before the deadline the same transaction is rejected by the script',
    ],
  },
];

export function PathExplorer() {
  const [selectedPathId, setSelectedPathId] = useState<CourtPath>('settle');
  const tablistId = useId();
  const selectedPath =
    PATH_DESCRIPTIONS.find(function matchesSelection(path) {
      return path.id === selectedPathId;
    }) ?? PATH_DESCRIPTIONS[0];

  if (selectedPath === undefined) {
    return null;
  }

  return (
    <section id="how-it-works" className={styles.section}>
      <div className="container">
        <p className="eyebrow">One covenant, three exits</p>
        <h2 className={styles.title}>How funds leave the escrow</h2>

        <div className={styles.explorer}>
          <div className={styles.controls}>
            <div role="tablist" aria-label="Escrow exit paths" className={styles.tabs} id={tablistId}>
              {PATH_DESCRIPTIONS.map(function renderTab(path) {
                const isSelected = path.id === selectedPathId;
                return (
                  <button
                    key={path.id}
                    role="tab"
                    type="button"
                    id={`${tablistId}-${path.id}`}
                    aria-selected={isSelected}
                    aria-controls={`${tablistId}-panel`}
                    tabIndex={isSelected ? 0 : -1}
                    className={styles.tab}
                    onClick={function selectPath() {
                      setSelectedPathId(path.id);
                    }}
                  >
                    {isSelected ? (
                      <motion.span
                        layoutId="path-tab-indicator"
                        className={styles.tabIndicator}
                        transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                      />
                    ) : null}
                    <span className={styles.tabLabel}>{path.label}</span>
                  </button>
                );
              })}
            </div>

            <div
              role="tabpanel"
              id={`${tablistId}-panel`}
              aria-labelledby={`${tablistId}-${selectedPath.id}`}
              className={styles.panel}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedPath.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
                >
                  <h3 className={styles.panelHeadline}>{selectedPath.headline}</h3>
                  <p className={styles.panelSummary}>{selectedPath.summary}</p>
                  <ul className={styles.conditions}>
                    {selectedPath.conditions.map(function renderCondition(condition) {
                      return (
                        <li key={condition}>
                          <CheckIcon size={18} />
                          <span>{condition}</span>
                        </li>
                      );
                    })}
                  </ul>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className={styles.diagram}>
            <CourtDiagram activePath={selectedPathId} />
          </div>
        </div>
      </div>
    </section>
  );
}
