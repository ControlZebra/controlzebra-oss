import { describe, expect, it } from 'vitest';

import {
  changeRequestFileStatusLabel,
  changeRequestFileSummary,
  mergeReadinessLabel,
  reviewStatusDetail,
  reviewStatusFromDecision,
  reviewStatusLabel,
} from './change-request-presentation';

describe('change request presentation', () => {
  it('preserves missing review decisions as unavailable', () => {
    expect(reviewStatusFromDecision('')).toBe('unavailable');
    expect(reviewStatusFromDecision(null)).toBe('unavailable');
    expect(reviewStatusFromDecision(undefined)).toBe('unavailable');
    expect(reviewStatusLabel('unavailable')).toBe('Not available');
    expect(reviewStatusDetail('unavailable')).toBe('Review status not available yet.');
  });

  it('never leaks raw GitHub merge state enums to users', () => {
    expect(mergeReadinessLabel('CLEAN')).toBe('Ready to merge on GitHub');
    expect(mergeReadinessLabel('DIRTY')).toBe('Conflicts must be resolved before merging');
    expect(mergeReadinessLabel('')).toBe('Not available');
    expect(mergeReadinessLabel(undefined)).toBe('Not available');
  });

  it('groups industrial files using the existing viewer file types', () => {
    const summary = changeRequestFileSummary([
      { path: 'logic/Mixer.L5X', status: 'modified', additions: 1, deletions: 0 },
      { path: 'hmi/screen.json', status: 'modified', additions: 1, deletions: 0 },
      { path: 'drawings/frame.step', status: 'modified', additions: 1, deletions: 0 },
      { path: 'notes/release.txt', status: 'modified', additions: 1, deletions: 0 },
    ]);

    expect(summary).toEqual([
      { label: 'ladder logic file', count: 1 },
      { label: 'HMI or configuration file', count: 1 },
      { label: 'drawing or media file', count: 1 },
      { label: 'other project file', count: 1 },
    ]);
    expect(changeRequestFileStatusLabel('renamed')).toBe('Renamed');
  });
});