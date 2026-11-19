import { motion } from 'motion/react';
import type { CaseRecord } from '../../../src/core/caseRecord';
import { formatSatoshis } from '../lib/format';
import { LinkButton } from './Button';
import { ArrowRightIcon } from './Icons';
import { CountUp } from './CountUp';
import styles from './Hero.module.css';

interface HeroProps {
  readonly records: readonly CaseRecord[];
}

const REVEAL_TRANSITION = { duration: 0.6, ease: [0.2, 0.7, 0.2, 1] } as const;

function summarizeRecords(records: readonly CaseRecord[]) {
  const escrowedSatoshis = records.reduce(function addEscrow(total, record) {
    return total + record.escrowSatoshis;
  }, 0);
  const transactionCount = records.reduce(function addTransactions(total, record) {
    return total + record.transactions.length;
  }, 0);
  return { caseCount: records.length, escrowedSatoshis, transactionCount };
}

export function Hero({ records }: HeroProps) {
  const summary = summarizeRecords(records);

  return (
    <section id="top" className={styles.hero}>
      <div className={`container ${styles.layout}`}>
        <motion.p
          className="eyebrow"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={REVEAL_TRANSITION}
        >
          Escrow for the agent economy
        </motion.p>
        <motion.h1
          className={styles.headline}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL_TRANSITION, delay: 0.08 }}
        >
          Agents that hire agents need a court.
        </motion.h1>
        <motion.p
          className={styles.lede}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL_TRANSITION, delay: 0.16 }}
        >
          AgentCourt holds payment in a Bitcoin Cash covenant. Code releases it when the work
          checks out. A three-member jury rules when it cannot. If the worker goes silent, the
          client takes the money back at the deadline.
        </motion.p>
        <motion.div
          className={styles.actions}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...REVEAL_TRANSITION, delay: 0.24 }}
        >
          <LinkButton href="#docket">
            Open the docket
            <ArrowRightIcon size={18} />
          </LinkButton>
          <LinkButton href="#draft" variant="secondary">
            Draft an escrow
          </LinkButton>
        </motion.div>
        <motion.dl
          className={styles.figures}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...REVEAL_TRANSITION, delay: 0.4 }}
        >
          <div className={styles.figure}>
            <dt>Cases on record</dt>
            <dd>
              <CountUp target={summary.caseCount} format={formatSatoshis} />
            </dd>
          </div>
          <div className={styles.figure}>
            <dt>Satoshis escrowed</dt>
            <dd>
              <CountUp target={summary.escrowedSatoshis} format={formatSatoshis} />
            </dd>
          </div>
          <div className={styles.figure}>
            <dt>On-chain transactions</dt>
            <dd>
              <CountUp target={summary.transactionCount} format={formatSatoshis} />
            </dd>
          </div>
        </motion.dl>
      </div>
    </section>
  );
}
