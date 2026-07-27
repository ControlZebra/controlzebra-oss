import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHubChangeRequest } from '../../../domain/repo/context/RepoContext.types';

const loadChangeRequests = vi.fn();

const repoState = {
  changeRequestViewerLogin: 'current-user',
  changeRequests: [] as GitHubChangeRequest[],
  omittedExternalChangeRequestCount: 0,
  isLoadingChangeRequests: false,
  changeRequestError: null,
  loadChangeRequests,
};

vi.mock('../../../context', () => ({
  useRepo: () => repoState,
}));

import ReviewsView from './ReviewsView';

describe('ReviewsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoState.changeRequests = [
      {
        number: 12,
        title: 'Adjust motor configuration',
        url: 'https://github.com/controlzebra/plant-project/pull/12',
        state: 'OPEN',
        isDraft: false,
        author: { login: 'current-user' },
        headRefName: 'motor-config',
        headRefOid: 'head-12',
        baseRefName: 'main',
        baseRefOid: 'base-12',
        reviewDecision: '',
        mergeStateStatus: 'CLEAN',
        isCrossRepository: false,
        createdAt: '2026-07-27T00:00:00Z',
        updatedAt: '2026-07-28T00:00:00Z',
        reviewers: [],
      },
      {
        number: 11,
        title: 'Update ladder safety check',
        url: 'https://github.com/controlzebra/plant-project/pull/11',
        state: 'OPEN',
        isDraft: false,
        author: { login: 'teammate' },
        headRefName: 'ladder-safety',
        headRefOid: 'head-11',
        baseRefName: 'main',
        baseRefOid: 'base-11',
        reviewDecision: '',
        mergeStateStatus: 'CLEAN',
        isCrossRepository: false,
        createdAt: '2026-07-26T00:00:00Z',
        updatedAt: '2026-07-27T00:00:00Z',
        reviewers: [],
      },
    ];
    repoState.omittedExternalChangeRequestCount = 1;
  });

  it('groups requests using the authenticated GitHub login and reports omitted external requests', () => {
    render(<ReviewsView />);

    expect(screen.getByText('Team Change Requests')).toBeInTheDocument();
    expect(screen.getByText('Your requests')).toBeInTheDocument();
    expect(screen.getByText('Update ladder safety check')).toBeInTheDocument();
    expect(screen.getByText('Adjust motor configuration')).toBeInTheDocument();
    expect(screen.getByText('Some external Change Requests are available on GitHub.')).toBeInTheDocument();
  });
});