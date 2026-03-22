import { describe, expect, it } from 'vitest';

import { computeGraphLayout } from './GitGraph';

describe('computeGraphLayout', () => {
  it('assigns a new color to a branch created from master', () => {
    const commits = [
      {
        hash: 'feature-tip',
        shortHash: 'feat2',
        message: 'Feature work 2',
        author: 'Tester',
        relativeDate: '1 hour ago',
        refs: ['feature/tank-logic'],
        parents: ['feature-base'],
      },
      {
        hash: 'feature-base',
        shortHash: 'feat1',
        message: 'Feature work 1',
        author: 'Tester',
        relativeDate: '2 hours ago',
        refs: [],
        parents: ['master-tip'],
      },
      {
        hash: 'master-tip',
        shortHash: 'main1',
        message: 'Master branch tip',
        author: 'Tester',
        relativeDate: '3 hours ago',
        refs: ['master'],
        parents: ['base'],
      },
      {
        hash: 'base',
        shortHash: 'base0',
        message: 'Shared history',
        author: 'Tester',
        relativeDate: '4 hours ago',
        refs: [],
        parents: [],
      },
    ];

    const { nodes } = computeGraphLayout(commits);

    const featureTip = nodes.find((node) => node.hash === 'feature-tip');
    const featureBase = nodes.find((node) => node.hash === 'feature-base');
    const masterTip = nodes.find((node) => node.hash === 'master-tip');
    const base = nodes.find((node) => node.hash === 'base');

    expect(featureTip).toBeDefined();
    expect(featureBase).toBeDefined();
    expect(masterTip).toBeDefined();
    expect(base).toBeDefined();

    expect(featureTip?.color).toBe(featureBase?.color);
    expect(featureTip?.color).not.toBe(masterTip?.color);
    expect(masterTip?.color).toBe(base?.color);
    expect(masterTip?.color).toBe('#3b82f6');
  });

  it('keeps linear master history on the primary color', () => {
    const commits = [
      {
        hash: 'master-head',
        shortHash: 'main2',
        message: 'Latest master commit',
        author: 'Tester',
        relativeDate: '1 hour ago',
        refs: ['master'],
        parents: ['master-parent'],
      },
      {
        hash: 'master-parent',
        shortHash: 'main1',
        message: 'Earlier master commit',
        author: 'Tester',
        relativeDate: '2 hours ago',
        refs: [],
        parents: [],
      },
    ];

    const { nodes } = computeGraphLayout(commits);

    expect(nodes.every((node) => node.color === '#3b82f6')).toBe(true);
  });

  it('does not reuse colors across visible branch refs', () => {
    const commits = [
      {
        hash: 'feature-a-head',
        shortHash: 'fa2',
        message: 'Feature A head',
        author: 'Tester',
        relativeDate: '1 hour ago',
        refs: ['feature/a'],
        parents: ['shared-base'],
      },
      {
        hash: 'feature-b-head',
        shortHash: 'fb2',
        message: 'Feature B head',
        author: 'Tester',
        relativeDate: '2 hours ago',
        refs: ['feature/b'],
        parents: ['shared-base'],
      },
      {
        hash: 'feature-c-head',
        shortHash: 'fc2',
        message: 'Feature C head',
        author: 'Tester',
        relativeDate: '3 hours ago',
        refs: ['feature/c'],
        parents: ['shared-base'],
      },
      {
        hash: 'main-head',
        shortHash: 'main2',
        message: 'Main head',
        author: 'Tester',
        relativeDate: '4 hours ago',
        refs: ['main'],
        parents: ['shared-base'],
      },
      {
        hash: 'shared-base',
        shortHash: 'base1',
        message: 'Shared base',
        author: 'Tester',
        relativeDate: '5 hours ago',
        refs: [],
        parents: [],
      },
    ];

    const { nodes } = computeGraphLayout(commits);

    const branchTipColors = nodes
      .filter((node) => node.refs.length > 0)
      .map((node) => node.color);

    expect(new Set(branchTipColors).size).toBe(branchTipColors.length);
  });
});