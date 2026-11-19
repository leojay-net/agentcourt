import type { FieldRequirement, Finding } from './types';

export type ParsedDeliverable =
  | { readonly kind: 'object'; readonly fields: Readonly<Record<string, unknown>> }
  | { readonly kind: 'invalid'; readonly reason: string };

export function parseDeliverable(deliverableText: string | null): ParsedDeliverable {
  if (deliverableText === null) {
    return { kind: 'invalid', reason: 'no deliverable was presented' };
  }
  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(deliverableText);
  } catch (parseFailure) {
    const failureMessage = parseFailure instanceof Error ? parseFailure.message : 'unknown error';
    return { kind: 'invalid', reason: `deliverable is not valid JSON (${failureMessage})` };
  }
  if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
    return { kind: 'invalid', reason: 'deliverable must be a JSON object' };
  }
  return { kind: 'object', fields: parsedValue as Record<string, unknown> };
}

export function checkFieldPresence(
  fields: Readonly<Record<string, unknown>>,
  requirement: FieldRequirement,
): Finding {
  const checkName = `field "${requirement.fieldName}" present`;
  const isPresent = Object.hasOwn(fields, requirement.fieldName);
  return {
    checkName,
    passed: isPresent,
    detail: isPresent ? 'present' : 'missing from the deliverable',
  };
}

export function checkFieldSubstance(
  fields: Readonly<Record<string, unknown>>,
  requirement: FieldRequirement,
): Finding {
  const checkName = `field "${requirement.fieldName}" satisfies its constraints`;
  const fieldValue = fields[requirement.fieldName];

  switch (requirement.kind) {
    case 'string': {
      if (typeof fieldValue !== 'string') {
        return { checkName, passed: false, detail: 'expected a string' };
      }
      const minimumLength = requirement.minimumLength ?? 1;
      const isLongEnough = fieldValue.trim().length >= minimumLength;
      return {
        checkName,
        passed: isLongEnough,
        detail: isLongEnough
          ? `${fieldValue.trim().length} characters`
          : `${fieldValue.trim().length} characters, needs at least ${minimumLength}`,
      };
    }
    case 'array': {
      if (!Array.isArray(fieldValue)) {
        return { checkName, passed: false, detail: 'expected an array' };
      }
      const minimumLength = requirement.minimumLength ?? 1;
      const hasEnoughItems = fieldValue.length >= minimumLength;
      return {
        checkName,
        passed: hasEnoughItems,
        detail: hasEnoughItems
          ? `${fieldValue.length} items`
          : `${fieldValue.length} items, needs at least ${minimumLength}`,
      };
    }
    case 'number': {
      if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue)) {
        return { checkName, passed: false, detail: 'expected a finite number' };
      }
      const isAboveMinimum =
        requirement.minimumValue === undefined || fieldValue >= requirement.minimumValue;
      const isBelowMaximum =
        requirement.maximumValue === undefined || fieldValue <= requirement.maximumValue;
      return {
        checkName,
        passed: isAboveMinimum && isBelowMaximum,
        detail:
          isAboveMinimum && isBelowMaximum
            ? `${fieldValue} is inside the accepted range`
            : `${fieldValue} is outside the accepted range`,
      };
    }
  }
}
