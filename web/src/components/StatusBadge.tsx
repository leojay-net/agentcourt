import type { CaseStatus } from '../../../src/core/caseRecord';
import styles from './StatusBadge.module.css';

interface StatusDescriptor {
  readonly label: string;
  readonly tone: 'primary' | 'alert' | 'neutral';
}

const STATUS_DESCRIPTORS: Readonly<Record<CaseStatus, StatusDescriptor>> = {
  settled: { label: 'Settled by code', tone: 'primary' },
  'ruled-for-worker': { label: 'Jury paid worker', tone: 'primary' },
  'ruled-for-client': { label: 'Jury refunded client', tone: 'alert' },
  refunded: { label: 'Refunded at deadline', tone: 'alert' },
  'awaiting-deadline': { label: 'Awaiting deadline', tone: 'neutral' },
};

export function StatusBadge({ status }: { readonly status: CaseStatus }) {
  const descriptor = STATUS_DESCRIPTORS[status];
  return <span className={`${styles.badge} ${styles[descriptor.tone]}`}>{descriptor.label}</span>;
}
