import type {
  ConflictRegion,
  ConflictRegionDecision,
  ConflictSegment,
} from '../types';

export interface ConflictDecisionValidation {
  complete: boolean;
  regionIds: string[];
  unresolvedRegionIds: string[];
  unknownDecisionIds: string[];
  invalidDecisionIds: string[];
}

export interface ComposeConflictResolutionInput {
  segments: ConflictSegment[];
  decisions: Record<string, ConflictRegionDecision>;
  newline?: string;
  hasFinalNewline: boolean;
}

export type ComposeConflictResolutionResult =
  | {
      ok: true;
      content: string;
      validation: ConflictDecisionValidation;
    }
  | {
      ok: false;
      error: 'unresolved-regions' | 'unknown-decisions' | 'invalid-decisions';
      validation: ConflictDecisionValidation;
    };

const DEFAULT_NEWLINE = '\n';

function getConflictRegions(segments: ConflictSegment[]): ConflictRegion[] {
  return segments
    .filter((segment): segment is Extract<ConflictSegment, { kind: 'conflict' }> => segment.kind === 'conflict')
    .map((segment) => segment.conflict);
}

function isBooleanArrayForLines(choices: boolean[] | undefined, lines: string[]): boolean {
  return Array.isArray(choices)
    && choices.length === lines.length
    && choices.every((choice) => typeof choice === 'boolean');
}

function isValidDecision(region: ConflictRegion, decision: ConflictRegionDecision): boolean {
  switch (decision.mode) {
    case 'unresolved':
      return true;
    case 'block':
      return decision.side === 'current' || decision.side === 'incoming';
    case 'lines':
      return isBooleanArrayForLines(decision.lines.current, region.current)
        && isBooleanArrayForLines(decision.lines.incoming, region.incoming)
        && (decision.lines.current.some(Boolean) || decision.lines.incoming.some(Boolean));
    case 'remove':
      return true;
    default:
      return false;
  }
}

export function validateConflictDecisions(
  segments: ConflictSegment[],
  decisions: Record<string, ConflictRegionDecision>,
): ConflictDecisionValidation {
  const regions = getConflictRegions(segments);
  const regionIds = regions.map((region) => region.id);
  const regionIdSet = new Set(regionIds);
  const unknownDecisionIds = Object.keys(decisions).filter((decisionId) => !regionIdSet.has(decisionId));
  const unresolvedRegionIds: string[] = [];
  const invalidDecisionIds: string[] = [];

  for (const region of regions) {
    const decision = decisions[region.id];

    if (!decision || decision.mode === 'unresolved') {
      unresolvedRegionIds.push(region.id);
      continue;
    }

    if (!isValidDecision(region, decision)) {
      invalidDecisionIds.push(region.id);
    }
  }

  return {
    complete: unresolvedRegionIds.length === 0
      && unknownDecisionIds.length === 0
      && invalidDecisionIds.length === 0,
    regionIds,
    unresolvedRegionIds,
    unknownDecisionIds,
    invalidDecisionIds,
  };
}

function resolveConflictRegion(
  region: ConflictRegion,
  decision: ConflictRegionDecision,
  newline: string,
  terminateWithNewline: boolean,
): string {
  let selectedLines: string[];

  switch (decision.mode) {
    case 'block':
      selectedLines = decision.side === 'current' ? region.current : region.incoming;
      break;
    case 'lines': {
      selectedLines = [];

      for (const [index, selected] of decision.lines.current.entries()) {
        if (selected) {
          selectedLines.push(region.current[index]);
        }
      }

      for (const [index, selected] of decision.lines.incoming.entries()) {
        if (selected) {
          selectedLines.push(region.incoming[index]);
        }
      }
      break;
    }
    case 'remove':
      return '';
    case 'unresolved':
    default:
      return '';
  }

  const content = selectedLines.join(newline);
  return selectedLines.length > 0 && terminateWithNewline ? content + newline : content;
}

export function composeConflictResolution(
  input: ComposeConflictResolutionInput,
): ComposeConflictResolutionResult {
  const validation = validateConflictDecisions(input.segments, input.decisions);

  if (validation.unknownDecisionIds.length > 0) {
    return { ok: false, error: 'unknown-decisions', validation };
  }

  if (validation.invalidDecisionIds.length > 0) {
    return { ok: false, error: 'invalid-decisions', validation };
  }

  if (validation.unresolvedRegionIds.length > 0) {
    return { ok: false, error: 'unresolved-regions', validation };
  }

  const newline = input.newline || DEFAULT_NEWLINE;
  const output: string[] = [];

  for (const [index, segment] of input.segments.entries()) {
    if (segment.kind === 'context') {
      output.push(segment.text);
      continue;
    }

    const decision = input.decisions[segment.conflict.id];
    const terminateWithNewline = index < input.segments.length - 1 || input.hasFinalNewline;
    output.push(resolveConflictRegion(segment.conflict, decision, newline, terminateWithNewline));
  }

  return {
    ok: true,
    content: output.join(''),
    validation,
  };
}