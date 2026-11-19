import { motion } from 'motion/react';
import type { CaseRecord } from '../../../src/core/caseRecord';
import { addressUrl, formatBch, formatSatoshis, shortenAddress, shortenMiddle } from '../lib/format';
import { ArrowUpRightIcon } from './Icons';
import { CopyableValue } from './CopyableValue';
import { JuryPanel } from './JuryPanel';
import { StatusBadge } from './StatusBadge';
import { TransactionTimeline } from './TransactionTimeline';
import styles from './CaseDetail.module.css';

function formatDeliverable(deliverableText: string): string {
  try {
    return JSON.stringify(JSON.parse(deliverableText), null, 2);
  } catch {
    return deliverableText;
  }
}

export function CaseDetail({ record }: { readonly record: CaseRecord }) {
  return (
    <motion.article
      key={record.caseId}
      className={styles.detail}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
    >
      <header className={styles.header}>
        <StatusBadge status={record.status} />
        <h3 className={styles.title}>{record.title}</h3>
        <p className={styles.summary}>{record.specification.summary}</p>
      </header>

      <dl className={styles.terms}>
        <div>
          <dt>Escrow</dt>
          <dd className="tabular">
            {formatSatoshis(record.escrowSatoshis)} sats
            <small>{formatBch(record.escrowSatoshis)} BCH</small>
          </dd>
        </div>
        <div>
          <dt>Refund unlocks at block</dt>
          <dd className="tabular">{formatSatoshis(record.terms.refundBlockHeight)}</dd>
        </div>
        <div>
          <dt>Covenant address</dt>
          <dd>
            <CopyableValue
              value={record.contractAddress}
              displayText={shortenAddress(record.contractAddress)}
              accessibleLabel="covenant address"
            />
            <a
              className={styles.explorerLink}
              href={addressUrl(record.contractAddress)}
              target="_blank"
              rel="noreferrer"
            >
              View on explorer <ArrowUpRightIcon size={14} />
            </a>
          </dd>
        </div>
        <div>
          <dt>Acceptance hash</dt>
          <dd>
            <CopyableValue
              value={record.terms.acceptanceHashHex}
              displayText={shortenMiddle(record.terms.acceptanceHashHex, 10, 8)}
              accessibleLabel="acceptance hash"
            />
          </dd>
        </div>
      </dl>

      <section className={styles.section}>
        <h4 className={styles.sectionTitle}>Transactions</h4>
        <TransactionTimeline transactions={record.transactions} />
      </section>

      {record.deliverableText !== null ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Deliverable presented</h4>
          <pre className={`${styles.deliverable} mono`}>{formatDeliverable(record.deliverableText)}</pre>
        </section>
      ) : null}

      {record.verdicts.length > 0 ? (
        <section className={styles.section}>
          <h4 className={styles.sectionTitle}>Jury</h4>
          <JuryPanel verdicts={record.verdicts} />
        </section>
      ) : null}
    </motion.article>
  );
}
