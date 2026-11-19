import { motion } from 'motion/react';
import type { CaseTransaction } from '../../../src/core/caseRecord';
import { useTransactionStatus } from '../hooks/useTransactionStatus';
import { shortenMiddle, transactionUrl } from '../lib/format';
import { ArrowUpRightIcon } from './Icons';
import styles from './TransactionTimeline.module.css';

interface TransactionTimelineProps {
  readonly transactions: readonly CaseTransaction[];
}

export function TransactionTimeline({ transactions }: TransactionTimelineProps) {
  return (
    <ol className={styles.timeline}>
      {transactions.map(function renderTransaction(transaction, transactionIndex) {
        return (
          <motion.li
            key={transaction.transactionId}
            className={styles.step}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + transactionIndex * 0.12, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <span className={styles.marker} aria-hidden="true" />
            <TransactionStep transaction={transaction} />
          </motion.li>
        );
      })}
    </ol>
  );
}

function TransactionStep({ transaction }: { readonly transaction: CaseTransaction }) {
  const chainState = useTransactionStatus(transaction.transactionId);

  return (
    <div className={styles.content}>
      <div className={styles.heading}>
        <span className={styles.kind}>{transaction.kind}</span>
        <ConfirmationChip chainState={chainState} />
      </div>
      <p className={styles.label}>{transaction.label}</p>
      <a
        className={`${styles.link} mono`}
        href={transactionUrl(transaction.transactionId)}
        target="_blank"
        rel="noreferrer"
      >
        {shortenMiddle(transaction.transactionId, 12, 10)}
        <ArrowUpRightIcon size={14} />
      </a>
    </div>
  );
}

function ConfirmationChip({ chainState }: { readonly chainState: ReturnType<typeof useTransactionStatus> }) {
  if (chainState.status === 'loading') {
    return <span className={`${styles.chip} ${styles.pending}`}>checking chain</span>;
  }
  if (chainState.status === 'failed') {
    return <span className={`${styles.chip} ${styles.pending}`}>chain unreachable</span>;
  }
  const { transaction } = chainState;
  if (transaction.state === 'confirmed') {
    return (
      <span className={`${styles.chip} ${styles.confirmed}`}>
        {transaction.confirmations.toLocaleString('en-US')}{' '}
        {transaction.confirmations === 1 ? 'confirmation' : 'confirmations'}
      </span>
    );
  }
  if (transaction.state === 'mempool') {
    return <span className={`${styles.chip} ${styles.pending}`}>in mempool</span>;
  }
  return <span className={`${styles.chip} ${styles.missing}`}>not found on chipnet</span>;
}
