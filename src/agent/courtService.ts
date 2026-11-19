import type { NetworkProvider } from 'cashscript';
import type { AgentRoster } from '../core/agentRoster';
import { instantiateCourtContract } from '../core/courtContract';
import { deserializeEscrowTerms } from '../core/terms';
import { conveneJury } from '../jurors/jury';
import type { CaseBrief } from '../jurors/types';
import { StructureJuror, SubstanceJuror, TimelinessJuror } from '../jurors/verifierJurors';
import { toFieldRequirement, type JobFile, type JobStore } from './jobModel';

/**
 * The court is the only process that holds juror keys. It convenes the jury for
 * a job a worker has submitted and records the ruling beside the job.
 */
export async function ruleOnSubmittedJob(
  provider: NetworkProvider,
  roster: AgentRoster,
  jobStore: JobStore,
  caseId: string,
): Promise<JobFile> {
  const job = jobStore.load(caseId);
  if (job.status !== 'submitted-to-court') {
    throw new Error(`Job ${caseId} is ${job.status}; only submitted jobs can be ruled on`);
  }
  const terms = deserializeEscrowTerms(job.terms);
  const contract = instantiateCourtContract(terms, provider);
  const brief: CaseBrief = {
    caseTitle: job.title,
    specification: { summary: job.summary, requiredFields: job.requiredFields.map(toFieldRequirement) },
    deliverableText: job.deliverableText,
    deliveredAtBlockHeight: job.deliveredAtBlockHeight,
    deadlineBlockHeight: terms.refundBlockHeight,
  };
  const decision = await conveneJury({
    provider,
    contract,
    brief,
    jurors: [
      new StructureJuror(roster.jurorOne),
      new SubstanceJuror(roster.jurorTwo),
      new TimelinessJuror(roster.jurorThree),
    ],
    client: roster.client,
    worker: roster.worker,
  });
  const ruledJob: JobFile = {
    ...job,
    status: decision.winner === 'worker' ? 'ruled-for-worker' : 'ruled-for-client',
    rulingTransactionId: decision.receipt.transactionId,
    verdicts: [...decision.verdicts],
  };
  jobStore.save(ruledJob);
  return ruledJob;
}
