import { describe, expect, it } from 'vitest';

import type { ConflictRegion, ConflictSegment } from '../types';
import {
  composeConflictResolution,
  validateConflictDecisions,
  type ComposeConflictResolutionInput,
} from './conflict-composer';

function context(text: string): ConflictSegment {
  return { kind: 'context', text };
}

function conflict(
  id: string,
  current: string[],
  incoming: string[],
  base: string[] = [],
): ConflictSegment {
  return {
    kind: 'conflict',
    conflict: { id, current, incoming, base },
  };
}

function conflictRegion(
  id: string,
  current: string[],
  incoming: string[],
  base: string[] = [],
): ConflictRegion {
  return { id, current, incoming, base };
}

function expectComposed(input: ComposeConflictResolutionInput, expected: string): void {
  const result = composeConflictResolution(input);

  expect(result).toMatchObject({ ok: true });

  if (!result.ok) {
    throw new Error(`Expected composition to succeed, got ${result.error}`);
  }

  expect(result.content).toBe(expected);
}

describe('composeConflictResolution', () => {
  it.each([
    {
      name: 'LF with final newline',
      newline: '\n',
      hasFinalNewline: true,
      segments: [
        context('alpha\n'),
        conflict('region-1', ['current'], ['incoming']),
        context('omega\n'),
      ],
      expected: 'alpha\ncurrent\nomega\n',
    },
    {
      name: 'CRLF with final newline',
      newline: '\r\n',
      hasFinalNewline: true,
      segments: [
        context('alpha\r\n'),
        conflict('region-1', ['current'], ['incoming']),
        context('omega\r\n'),
      ],
      expected: 'alpha\r\ncurrent\r\nomega\r\n',
    },
    {
      name: 'UTF-8 BOM preserved from first context segment',
      newline: '\n',
      hasFinalNewline: true,
      segments: [
        context('\uFEFFalpha\n'),
        conflict('region-1', ['current'], ['incoming']),
        context('omega\n'),
      ],
      expected: '\uFEFFalpha\ncurrent\nomega\n',
    },
    {
      name: 'no final newline',
      newline: '\n',
      hasFinalNewline: false,
      segments: [
        context('alpha\n'),
        conflict('region-1', ['current'], ['incoming']),
        context('omega'),
      ],
      expected: 'alpha\ncurrent\nomega',
    },
  ])('composes a block decision for $name', ({ newline, hasFinalNewline, segments, expected }) => {
    expectComposed({
      segments,
      decisions: { 'region-1': { mode: 'block', side: 'current' } },
      newline,
      hasFinalNewline,
    }, expected);
  });

  it('composes several conflict regions while preserving untouched context', () => {
    expectComposed({
      segments: [
        context('header\n'),
        conflict('region-1', ['current-a'], ['incoming-a']),
        context('middle\n'),
        conflict('region-2', ['current-b'], ['incoming-b']),
        context('footer\n'),
      ],
      decisions: {
        'region-1': { mode: 'block', side: 'incoming' },
        'region-2': { mode: 'block', side: 'current' },
      },
      newline: '\n',
      hasFinalNewline: true,
    }, 'header\nincoming-a\nmiddle\ncurrent-b\nfooter\n');
  });

  it('composes line mode as selected Current lines followed by selected Incoming lines', () => {
    expectComposed({
      segments: [
        context('before\n'),
        conflict('region-1', ['current-a', 'current-b', 'current-c'], ['incoming-a', 'incoming-b']),
        context('after\n'),
      ],
      decisions: {
        'region-1': {
          mode: 'lines',
          lines: {
            current: [true, false, true],
            incoming: [false, true],
          },
        },
      },
      newline: '\n',
      hasFinalNewline: true,
    }, 'before\ncurrent-a\ncurrent-c\nincoming-b\nafter\n');
  });

  it('composes explicit remove mode as an empty conflict replacement', () => {
    expectComposed({
      segments: [
        context('before\n'),
        conflict('region-1', ['current'], ['incoming']),
        context('after\n'),
      ],
      decisions: { 'region-1': { mode: 'remove' } },
      newline: '\n',
      hasFinalNewline: true,
    }, 'before\nafter\n');
  });

  it.each([
    { name: 'with a final newline', hasFinalNewline: true, expected: 'before\ncurrent\n' },
    { name: 'without a final newline', hasFinalNewline: false, expected: 'before\ncurrent' },
  ])('preserves a conflict boundary at end of file $name', ({ hasFinalNewline, expected }) => {
    expectComposed({
      segments: [
        context('before\n'),
        conflict('region-1', ['current'], ['incoming']),
      ],
      decisions: { 'region-1': { mode: 'block', side: 'current' } },
      newline: '\n',
      hasFinalNewline,
    }, expected);
  });

  it('preserves a selected blank line instead of treating it as an empty side', () => {
    expectComposed({
      segments: [
        context('before\n'),
        conflict('region-1', [''], []),
        context('after\n'),
      ],
      decisions: { 'region-1': { mode: 'block', side: 'current' } },
      newline: '\n',
      hasFinalNewline: true,
    }, 'before\n\nafter\n');
  });

  it('returns unresolved diagnostics instead of composing unresolved regions', () => {
    const result = composeConflictResolution({
      segments: [conflict('region-1', ['current'], ['incoming'])],
      decisions: { 'region-1': { mode: 'unresolved' } },
      newline: '\n',
      hasFinalNewline: false,
    });

    expect(result).toEqual({
      ok: false,
      error: 'unresolved-regions',
      validation: {
        complete: false,
        regionIds: ['region-1'],
        unresolvedRegionIds: ['region-1'],
        unknownDecisionIds: [],
        invalidDecisionIds: [],
      },
    });
  });

  it('rejects unknown decision IDs as stale or invalid draft data', () => {
    const result = composeConflictResolution({
      segments: [conflict('region-1', ['current'], ['incoming'])],
      decisions: {
        'region-1': { mode: 'block', side: 'current' },
        stale: { mode: 'block', side: 'incoming' },
      },
      newline: '\n',
      hasFinalNewline: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'unknown-decisions',
      validation: { unknownDecisionIds: ['stale'] },
    });
  });

  it('rejects line decisions whose choice arrays do not match the source lines', () => {
    const result = composeConflictResolution({
      segments: [conflict('region-1', ['current-a', 'current-b'], ['incoming'])],
      decisions: {
        'region-1': {
          mode: 'lines',
          lines: {
            current: [true],
            incoming: [true],
          },
        },
      },
      newline: '\n',
      hasFinalNewline: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid-decisions',
      validation: { invalidDecisionIds: ['region-1'] },
    });
  });

  it('requires explicit remove mode when no conflict lines are selected', () => {
    const result = composeConflictResolution({
      segments: [conflict('region-1', ['current'], ['incoming'])],
      decisions: {
        'region-1': {
          mode: 'lines',
          lines: {
            current: [false],
            incoming: [false],
          },
        },
      },
      newline: '\n',
      hasFinalNewline: false,
    });

    expect(result).toMatchObject({
      ok: false,
      error: 'invalid-decisions',
      validation: { invalidDecisionIds: ['region-1'] },
    });
  });
});

describe('validateConflictDecisions', () => {
  it('reports complete decisions for all known regions', () => {
    const segments: ConflictSegment[] = [
      { kind: 'conflict', conflict: conflictRegion('region-1', ['current'], ['incoming']) },
    ];

    expect(validateConflictDecisions(segments, {
      'region-1': { mode: 'block', side: 'current' },
    })).toEqual({
      complete: true,
      regionIds: ['region-1'],
      unresolvedRegionIds: [],
      unknownDecisionIds: [],
      invalidDecisionIds: [],
    });
  });
});