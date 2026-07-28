import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GitHubChangeRequest,
  GitHubChangeRequestError,
  GitHubChangeRequestFile,
} from '../../../domain/repo/context/RepoContext.types';

const { startDeviceFlow, loadChangeRequests, closeDeviceFlow, openExternalUrl } = vi.hoisted(() => ({
  startDeviceFlow: vi.fn(),
  loadChangeRequests: vi.fn(),
  closeDeviceFlow: vi.fn(),
  openExternalUrl: vi.fn(),
}));

const repoState: {
  changeRequestRepository: null;
  changeRequests: GitHubChangeRequest[];
  changeRequestViewerLogin: string;
  changeRequestsMayHaveMore: boolean;
  isLoadingChangeRequests: boolean;
  changeRequestError: GitHubChangeRequestError | null;
  loadChangeRequests: typeof loadChangeRequests;
  selectedChangeRequest: GitHubChangeRequest | null;
  changeRequestFiles: GitHubChangeRequestFile[];
  changeRequestTotalFiles: number;
  isChangeRequestFilesTruncated: boolean;
  selectedChangeRequestFilePath: string | null;
  isLoadingChangeRequestDetail: boolean;
  changeRequestDetailError: GitHubChangeRequestError | null;
  selectChangeRequest: ReturnType<typeof vi.fn>;
  returnToChangeRequestOverview: ReturnType<typeof vi.fn>;
  installRequiredPackages: ReturnType<typeof vi.fn>;
  isInstallingPackages: boolean;
} = {
  changeRequestRepository: null,
  changeRequests: [],
  changeRequestViewerLogin: 'current-user',
  changeRequestsMayHaveMore: false,
  isLoadingChangeRequests: false,
  changeRequestError: { code: 'auth_required' as const },
  loadChangeRequests,
  selectedChangeRequest: null,
  changeRequestFiles: [],
  changeRequestTotalFiles: 0,
  isChangeRequestFilesTruncated: false,
  selectedChangeRequestFilePath: null,
  isLoadingChangeRequestDetail: false,
  changeRequestDetailError: null,
  selectChangeRequest: vi.fn(),
  returnToChangeRequestOverview: vi.fn(),
  installRequiredPackages: vi.fn(),
  isInstallingPackages: false,
};

vi.mock('../../../context', () => ({
  useRepo: () => repoState,
}));

vi.mock('../../../shared/runtime/browser', () => ({
  openExternalUrl: (url: string) => openExternalUrl(url),
}));

vi.mock('../../auth/hooks/useGitHubDeviceFlow', () => ({
  useGitHubDeviceFlow: () => ({
    deviceFlow: { isOpen: false, userCode: '', verificationUrl: '' },
    startDeviceFlow,
    closeDeviceFlow,
    handleDeviceFlowOpenChange: vi.fn(),
  }),
}));

vi.mock('../../auth/components/GitHubDeviceFlowModal', () => ({
  default: () => null,
}));

import ReviewsPage from './ReviewsPage';

describe('ReviewsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repoState.changeRequestError = { code: 'auth_required' };
    repoState.selectedChangeRequest = null;
    repoState.selectedChangeRequestFilePath = null;
    repoState.changeRequests = [];
    repoState.changeRequestFiles = [];
    repoState.isLoadingChangeRequestDetail = false;
    repoState.changeRequestDetailError = null;
  });

  it('starts the shared GitHub device flow when authentication is required', () => {
    render(<ReviewsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));

    expect(startDeviceFlow).toHaveBeenCalledOnce();
  });

  it('filters the table locally and loads a selected Change Request', () => {
    repoState.changeRequestError = null;
    repoState.changeRequests = [{
      number: 42,
      title: 'Update mixer sequence',
      body: 'Adds the requested mixer interlock.',
      url: 'https://github.com/controlzebra/plant-project/pull/42',
      state: 'OPEN',
      isDraft: false,
      author: { login: 'operator' },
      headRefName: 'work/mixer-interlock',
      headRefOid: 'head-oid',
      baseRefName: 'main',
      baseRefOid: 'base-oid',
      reviewDecision: '',
      mergeStateStatus: 'CLEAN',
      isCrossRepository: false,
      createdAt: '2026-07-20T10:00:00Z',
      updatedAt: '2026-07-21T10:00:00Z',
      reviewers: [{ login: 'reviewer', name: 'Review Engineer' }],
    }];

    render(<ReviewsPage />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Search Change Requests' }), { target: { value: 'mixer' } });
    fireEvent.click(screen.getByRole('button', { name: /Update mixer sequence/i }));

    expect(repoState.selectChangeRequest).toHaveBeenCalledWith(42);
  });

  it('keeps the viewer area empty until a changed file is selected', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = {
      number: 42,
      title: 'Update mixer sequence',
      body: 'Adds the requested mixer interlock.',
      url: 'https://github.com/controlzebra/plant-project/pull/42',
      author: { login: 'operator' },
      headRefName: 'work/mixer-interlock',
      baseRefName: 'main',
      reviewDecision: 'APPROVED',
      mergeStateStatus: 'CLEAN',
      reviewers: [{ login: 'reviewer', name: 'Review Engineer' }],
    } as GitHubChangeRequest;
    repoState.changeRequestFiles = [
      { path: 'logic/Mixer.L5X', status: 'modified', additions: 12, deletions: 4 },
      { path: 'hmi/panel.json', status: 'modified', additions: 3, deletions: 1 },
      { path: 'docs/notes.txt', status: 'added', additions: 5, deletions: 0 },
    ];

    render(<ReviewsPage />);

    expect(screen.getByTestId('change-request-header')).toBeInTheDocument();
    expect(screen.getByText('Adds the requested mixer interlock.')).toBeInTheDocument();
    expect(screen.getByText('operator')).toBeInTheDocument();
    expect(screen.getByText('work/mixer-interlock to main')).toBeInTheDocument();
    expect(screen.getByText('Review Engineer')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByTestId('change-request-viewer-empty')).toBeInTheDocument();
  });

  it('summarises changed project files in plain language before any diff is opened', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = { number: 42, mergeStateStatus: 'BLOCKED' } as GitHubChangeRequest;
    repoState.changeRequestFiles = [
      { path: 'logic/Mixer.L5X', status: 'modified', additions: 12, deletions: 4 },
      { path: 'logic/Filler.L5X', status: 'modified', additions: 2, deletions: 0 },
      { path: 'hmi/panel.json', status: 'modified', additions: 3, deletions: 1 },
    ];

    render(<ReviewsPage />);

    expect(screen.getByTestId('change-request-file-summary')).toHaveTextContent(
      '2 ladder logic files, 1 HMI or configuration file',
    );
    expect(screen.getByText('Blocked by GitHub project rules')).toBeInTheDocument();
    expect(screen.queryByText('BLOCKED')).not.toBeInTheDocument();
  });

  it('opens the request on GitHub from the detail header', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = {
      number: 42,
      url: 'https://github.com/controlzebra/plant-project/pull/42',
    } as GitHubChangeRequest;

    render(<ReviewsPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Open on GitHub' }));

    expect(openExternalUrl).toHaveBeenCalledWith('https://github.com/controlzebra/plant-project/pull/42');
  });

  it('reports a failed Change Request open instead of silently staying on the list', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = null;
    repoState.changeRequestDetailError = { code: 'permission_denied' };

    render(<ReviewsPage />);

    expect(screen.getByTestId('change-request-detail-error')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub did not grant access to this project');

    fireEvent.click(screen.getByRole('button', { name: 'Return to overview' }));

    expect(repoState.returnToChangeRequestOverview).toHaveBeenCalledOnce();
  });

  it('shows progress while a Change Request is opening', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = null;
    repoState.isLoadingChangeRequestDetail = true;

    render(<ReviewsPage />);

    expect(screen.getByTestId('change-request-detail-loading')).toBeInTheDocument();
  });

  it('shows the future viewer placeholder after a changed file is selected', () => {
    repoState.changeRequestError = null;
    repoState.selectedChangeRequest = { number: 42 } as GitHubChangeRequest;
    repoState.selectedChangeRequestFilePath = 'logic/Mixer.L5X';

    render(<ReviewsPage />);

    expect(screen.getByTestId('change-request-viewer-placeholder')).toBeInTheDocument();
  });
});