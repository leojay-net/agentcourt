import { motion } from 'motion/react';
import type { CaseRecord } from '../../../src/core/caseRecord';
import { CheckIcon, CrossIcon } from './Icons';
import styles from './JuryPanel.module.css';

type Verdict = CaseRecord['verdicts'][number];

const JUROR_PROFILES: Readonly<Record<string, { readonly name: string; readonly lens: string }>> = {
  jurorOne: { name: 'Juror one', lens: 'Structure' },
  jurorTwo: { name: 'Juror two', lens: 'Substance' },
  jurorThree: { name: 'Juror three', lens: 'Timeliness' },
};

function describeTally(verdicts: readonly Verdict[]): string {
  const votesForWorker = verdicts.filter(function votedForWorker(verdict) {
    return verdict.favoredParty === 'worker';
  }).length;
  const votesForClient = verdicts.length - votesForWorker;
  return `${votesForWorker} for the worker, ${votesForClient} for the client`;
}

export function JuryPanel({ verdicts }: { readonly verdicts: readonly Verdict[] }) {
  return (
    <div>
      <p className={styles.tally}>{describeTally(verdicts)}</p>
      <div className={styles.grid}>
        {verdicts.map(function renderVerdict(verdict, verdictIndex) {
          const profile = JUROR_PROFILES[verdict.jurorLabel];
          const favorsWorker = verdict.favoredParty === 'worker';
          return (
            <motion.article
              key={verdict.jurorPublicKeyHex}
              className={styles.card}
              data-favors={verdict.favoredParty}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 + verdictIndex * 0.12, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <header className={styles.cardHeader}>
                <div>
                  <h4 className={styles.jurorName}>{profile?.name ?? verdict.jurorLabel}</h4>
                  <p className={styles.lens}>{profile?.lens ?? 'Review'} review</p>
                </div>
                <span className={styles.vote}>{favorsWorker ? 'Worker' : 'Client'}</span>
              </header>
              <ul className={styles.findings}>
                {verdict.findings.map(function renderFinding(finding) {
                  return (
                    <li key={finding.checkName} data-passed={finding.passed}>
                      {finding.passed ? <CheckIcon size={16} /> : <CrossIcon size={16} />}
                      <span>
                        {finding.checkName}
                        <small>{finding.detail}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </motion.article>
          );
        })}
      </div>
    </div>
  );
}
