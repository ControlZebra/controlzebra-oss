import { afterEach, describe, expect, it } from 'vitest';

import type { DiffSide } from '../../registry/diff-registry';
import {
  clear3DDiffCacheForTests,
  has3DDiffCacheKeyForTests,
  invalidate3DDiffCacheForFile,
  invalidateWorkingTree3DDiffCache,
  makeCacheKey,
  prime3DDiffCacheForTests,
} from './Model3DDiffViewer';

describe('Model3DDiffViewer cache invalidation', () => {
  afterEach(() => {
    clear3DDiffCacheForTests();
  });

  it('removes entries whose serialized snapshots include working-tree sides', () => {
    const workingOldSide: DiffSide = {
      kind: 'working',
      absolutePath: '/repo/Models/Pump.step',
      path: 'Models/Pump.step',
    };
    const refNewSide: DiffSide = {
      kind: 'ref',
      ref: 'HEAD',
      path: 'Models/Pump.step',
    };
    const commitOldSide: DiffSide = {
      kind: 'ref',
      ref: 'deadbeef',
      path: 'Models/Valve.step',
    };
    const commitNewSide: DiffSide = {
      kind: 'ref',
      ref: 'abc1234',
      path: 'Models/Valve.step',
    };

    const workingKey = prime3DDiffCacheForTests('/repo', workingOldSide, refNewSide);
    const commitKey = prime3DDiffCacheForTests('/repo', commitOldSide, commitNewSide);

    expect(workingKey).toBe(makeCacheKey('/repo', workingOldSide, refNewSide));
    expect(commitKey).toBe(makeCacheKey('/repo', commitOldSide, commitNewSide));

    invalidateWorkingTree3DDiffCache();

    expect(has3DDiffCacheKeyForTests(workingKey)).toBe(false);
    expect(has3DDiffCacheKeyForTests(commitKey)).toBe(true);
  });

  it('removes only the specified file entries under serialized cache keys', () => {
    const targetOldSide: DiffSide = {
      kind: 'ref',
      ref: 'HEAD',
      path: 'Models/Pump.step',
    };
    const targetNewSide: DiffSide = {
      kind: 'working',
      absolutePath: '/repo/Models/Pump.step',
      path: 'Models/Pump.step',
    };
    const otherOldSide: DiffSide = {
      kind: 'ref',
      ref: 'HEAD',
      path: 'Models/Valve.step',
    };
    const otherNewSide: DiffSide = {
      kind: 'working',
      absolutePath: '/repo/Models/Valve.step',
      path: 'Models/Valve.step',
    };

    const targetKey = prime3DDiffCacheForTests('/repo', targetOldSide, targetNewSide);
    const otherKey = prime3DDiffCacheForTests('/repo', otherOldSide, otherNewSide);
    const foreignRepoKey = prime3DDiffCacheForTests(
      '/other-repo',
      targetOldSide,
      {
        kind: 'working',
        absolutePath: '/other-repo/Models/Pump.step',
        path: 'Models/Pump.step',
      },
    );

    expect(targetKey).toBe(makeCacheKey('/repo', targetOldSide, targetNewSide));

    invalidate3DDiffCacheForFile('/repo', 'Models/Pump.step');

    expect(has3DDiffCacheKeyForTests(targetKey)).toBe(false);
    expect(has3DDiffCacheKeyForTests(otherKey)).toBe(true);
    expect(has3DDiffCacheKeyForTests(foreignRepoKey)).toBe(true);
  });
});