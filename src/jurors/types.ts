import type { AgentIdentity } from '../core/identity';

export type FieldKind = 'string' | 'number' | 'array';

export interface FieldRequirement {
  readonly fieldName: string;
  readonly kind: FieldKind;
  /** For strings: minimum characters. For arrays: minimum items. */
  readonly minimumLength?: number;
  /** For numbers: inclusive lower bound. */
  readonly minimumValue?: number;
  /** For numbers: inclusive upper bound. */
  readonly maximumValue?: number;
}

export interface TaskSpecification {
  readonly summary: string;
  readonly requiredFields: readonly FieldRequirement[];
}

export interface CaseBrief {
  readonly caseTitle: string;
  readonly specification: TaskSpecification;
  /** The deliverable text the worker presented, or null when nothing was delivered. */
  readonly deliverableText: string | null;
  /** Block height at which the worker presented the deliverable, or null. */
  readonly deliveredAtBlockHeight: number | null;
  readonly deadlineBlockHeight: number;
}

export type FavoredParty = 'worker' | 'client';

export interface Finding {
  readonly checkName: string;
  readonly passed: boolean;
  readonly detail: string;
}

export interface Verdict {
  readonly jurorLabel: string;
  readonly jurorPublicKeyHex: string;
  readonly favoredParty: FavoredParty;
  readonly findings: Finding[];
  readonly reasoning: string;
}

/**
 * A juror is any process that can read a case brief and return a verdict. The
 * built-in jurors are deterministic verifiers; a model-backed juror implements
 * the same interface.
 */
export interface JurorAgent {
  readonly identity: AgentIdentity;
  deliberate(brief: CaseBrief): Promise<Verdict>;
}
