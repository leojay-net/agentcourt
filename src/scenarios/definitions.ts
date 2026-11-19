import type { ScenarioKind } from '../core/caseRecord';
import type { TaskSpecification } from '../jurors/types';

export interface ScenarioDefinition {
  readonly caseId: string;
  readonly title: string;
  readonly kind: ScenarioKind;
  readonly specification: TaskSpecification;
  /** What the worker presents. Null means the worker never delivers. */
  readonly deliverableText: string | null;
  readonly escrowSatoshis: bigint;
  /** Blocks between funding and the client's refund right. */
  readonly refundDelayInBlocks: number;
}

export const DEFAULT_ESCROW_SATOSHIS = 3_000n;

export const SCENARIO_DEFINITIONS: readonly ScenarioDefinition[] = [
  {
    caseId: 'invoice-sort',
    title: 'Sort twelve invoice totals',
    kind: 'deterministic-settlement',
    specification: {
      summary:
        'Return the twelve invoice totals in ascending order as a JSON array. The client committed to the SHA-256 of the correct answer, so the covenant itself checks the work.',
      requiredFields: [],
    },
    deliverableText: '[120,185,240,310,415,520,640,775,890,1020,1250,1600]',
    escrowSatoshis: DEFAULT_ESCROW_SATOSHIS,
    refundDelayInBlocks: 144,
  },
  {
    caseId: 'market-brief-accepted',
    title: 'Write a sourced market brief',
    kind: 'jury-for-worker',
    specification: {
      summary:
        'Deliver a JSON brief with a headline, a body of at least 120 characters, at least two cited sources, and a confidence score between 0 and 1. The result cannot be reduced to a hash, so a jury decides.',
      requiredFields: [
        { fieldName: 'headline', kind: 'string', minimumLength: 12 },
        { fieldName: 'body', kind: 'string', minimumLength: 120 },
        { fieldName: 'sources', kind: 'array', minimumLength: 2 },
        { fieldName: 'confidence', kind: 'number', minimumValue: 0, maximumValue: 1 },
      ],
    },
    deliverableText: JSON.stringify({
      headline: 'Bitcoin Cash fees stay below one cent through the week',
      body: 'Median transaction fees on Bitcoin Cash held under one US cent for the full seven-day window while daily transaction counts rose, which suggests spare block capacity rather than fee pressure. Mempool depth never exceeded two blocks.',
      sources: ['https://explorer.example/fees', 'https://explorer.example/mempool'],
      confidence: 0.82,
    }),
    escrowSatoshis: DEFAULT_ESCROW_SATOSHIS,
    refundDelayInBlocks: 144,
  },
  {
    caseId: 'market-brief-rejected',
    title: 'Write a sourced market brief (incomplete)',
    kind: 'jury-for-client',
    specification: {
      summary:
        'Same brief specification as the accepted case. The worker omits the sources field and writes a body far below the minimum, so two of the three jurors side with the client.',
      requiredFields: [
        { fieldName: 'headline', kind: 'string', minimumLength: 12 },
        { fieldName: 'body', kind: 'string', minimumLength: 120 },
        { fieldName: 'sources', kind: 'array', minimumLength: 2 },
        { fieldName: 'confidence', kind: 'number', minimumValue: 0, maximumValue: 1 },
      ],
    },
    deliverableText: JSON.stringify({
      headline: 'Fees are low',
      body: 'Fees are low this week.',
      confidence: 0.9,
    }),
    escrowSatoshis: DEFAULT_ESCROW_SATOSHIS,
    refundDelayInBlocks: 144,
  },
  {
    caseId: 'silent-worker',
    title: 'Scrape a price feed (worker goes silent)',
    kind: 'timeout-refund',
    specification: {
      summary:
        'The worker accepts the task and never delivers. After the deadline block the client reclaims the escrow with no help from anyone.',
      requiredFields: [],
    },
    deliverableText: null,
    escrowSatoshis: DEFAULT_ESCROW_SATOSHIS,
    refundDelayInBlocks: 2,
  },
];
