import { encodeHex } from '../core/hex';
import type { AgentIdentity } from '../core/identity';
import { checkFieldPresence, checkFieldSubstance, parseDeliverable } from './deliverableInspection';
import type { CaseBrief, Finding, JurorAgent, Verdict } from './types';

function buildVerdict(
  identity: AgentIdentity,
  findings: Finding[],
  passingSummary: string,
): Verdict {
  const failedFindings = findings.filter(function isFailure(finding) {
    return !finding.passed;
  });
  const favorsWorker = findings.length > 0 && failedFindings.length === 0;
  const reasoning = favorsWorker
    ? passingSummary
    : failedFindings
        .map(function describeFailure(finding) {
          return `${finding.checkName}: ${finding.detail}`;
        })
        .join('; ');

  return {
    jurorLabel: identity.label,
    jurorPublicKeyHex: encodeHex(identity.publicKey),
    favoredParty: favorsWorker ? 'worker' : 'client',
    findings,
    reasoning,
  };
}

/** Rules on whether the deliverable has the shape the task specification demands. */
export class StructureJuror implements JurorAgent {
  public constructor(public readonly identity: AgentIdentity) {}

  public async deliberate(brief: CaseBrief): Promise<Verdict> {
    const parsedDeliverable = parseDeliverable(brief.deliverableText);
    if (parsedDeliverable.kind === 'invalid') {
      return buildVerdict(
        this.identity,
        [{ checkName: 'deliverable is a JSON object', passed: false, detail: parsedDeliverable.reason }],
        '',
      );
    }

    const presenceFindings = brief.specification.requiredFields.map(function checkPresence(requirement) {
      return checkFieldPresence(parsedDeliverable.fields, requirement);
    });
    return buildVerdict(
      this.identity,
      [{ checkName: 'deliverable is a JSON object', passed: true, detail: 'parsed' }, ...presenceFindings],
      'The deliverable is a JSON object containing every required field.',
    );
  }
}

/** Rules on whether each field actually holds enough substance, not just a name. */
export class SubstanceJuror implements JurorAgent {
  public constructor(public readonly identity: AgentIdentity) {}

  public async deliberate(brief: CaseBrief): Promise<Verdict> {
    const parsedDeliverable = parseDeliverable(brief.deliverableText);
    if (parsedDeliverable.kind === 'invalid') {
      return buildVerdict(
        this.identity,
        [{ checkName: 'deliverable is inspectable', passed: false, detail: parsedDeliverable.reason }],
        '',
      );
    }

    const substanceFindings = brief.specification.requiredFields.map(function checkSubstance(requirement) {
      return checkFieldSubstance(parsedDeliverable.fields, requirement);
    });
    return buildVerdict(
      this.identity,
      substanceFindings,
      'Every required field meets its length and range constraints.',
    );
  }
}

/** Rules on whether the worker delivered, and did so before the deadline. */
export class TimelinessJuror implements JurorAgent {
  public constructor(public readonly identity: AgentIdentity) {}

  public async deliberate(brief: CaseBrief): Promise<Verdict> {
    const hasDelivered = brief.deliverableText !== null && brief.deliveredAtBlockHeight !== null;
    const deliveredInTime =
      hasDelivered &&
      brief.deliveredAtBlockHeight !== null &&
      brief.deliveredAtBlockHeight <= brief.deadlineBlockHeight;

    const findings: Finding[] = [
      {
        checkName: 'deliverable was presented',
        passed: hasDelivered,
        detail: hasDelivered ? 'presented' : 'nothing was presented',
      },
      {
        checkName: 'delivered before the deadline',
        passed: deliveredInTime,
        detail: deliveredInTime
          ? `block ${brief.deliveredAtBlockHeight} is at or before ${brief.deadlineBlockHeight}`
          : 'delivery missing or after the deadline',
      },
    ];
    return buildVerdict(this.identity, findings, 'Delivered on time.');
  }
}
