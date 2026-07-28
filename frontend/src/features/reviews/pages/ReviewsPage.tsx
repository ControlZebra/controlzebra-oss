import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ChevronDown, ChevronUp, ExternalLink, Github, GitPullRequest, Loader2, RefreshCw, Search } from 'lucide-react';

import { Badge, Button, Input, Select, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../shared/ui';
import { ICON_SIZES, MAIN_BRANCHES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import { openExternalUrl } from '../../../shared/runtime/browser';
import GitHubDeviceFlowModal from '../../auth/components/GitHubDeviceFlowModal';
import { useGitHubDeviceFlow } from '../../auth/hooks/useGitHubDeviceFlow';
import type { GitHubChangeRequest } from '../../../domain/repo/context/RepoContext.types';
import ChangeRequestPreview from '../components/ChangeRequestPreview';
import CreateChangeRequestDialog from '../components/CreateChangeRequestDialog';
import {
  changeRequestErrorCopy,
  changeRequestFileSummaryText,
  mergeReadinessLabel,
  reviewStatusDetail,
  reviewStatusFromDecision,
  reviewStatusLabel,
} from '../lib/change-request-presentation';

function ReviewsPage(): JSX.Element {
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [authorFilter, setAuthorFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('updated');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const {
    repoPath,
    repoStatus,
    changeRequestRepository,
    changeRequests,
    changeRequestViewerLogin,
    changeRequestsMayHaveMore,
    isLoadingChangeRequests,
    changeRequestError,
    loadChangeRequests,
    selectedChangeRequest,
    selectedChangeRequestFilePath,
    changeRequestFiles,
    isLoadingChangeRequestDetail,
    changeRequestDetailError,
    changeRequestSnapshot,
    isPreparingChangeRequestSnapshot,
    changeRequestSnapshotError,
    selectChangeRequest,
    returnToChangeRequestOverview,
    installRequiredPackages,
    isInstallingPackages,
  } = useRepo();
  const {
    deviceFlow,
    startDeviceFlow,
    closeDeviceFlow,
    handleDeviceFlowOpenChange,
  } = useGitHubDeviceFlow({ onStartError: setDeviceFlowError });
  const handleDeviceFlowComplete = useCallback((): void => {
    closeDeviceFlow();
    void loadChangeRequests();
  }, [closeDeviceFlow, loadChangeRequests]);

  useEffect(() => {
    void loadChangeRequests();
  }, [loadChangeRequests]);

  const filteredRequests = useMemo(() => {
    const normalizedQuery = searchTerm.trim().toLocaleLowerCase();
    const normalizedViewerLogin = changeRequestViewerLogin.toLocaleLowerCase();
    const matchesSearch = (request: GitHubChangeRequest): boolean => {
      if (!normalizedQuery) return true;
      return [request.title, String(request.number), request.author.login, request.headRefName, request.baseRefName]
        .some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    };

    return changeRequests
      .filter((request) => {
        const reviewStatus = reviewStatusFromDecision(request.reviewDecision);
        const isMine = request.author.login.toLocaleLowerCase() === normalizedViewerLogin;
        return matchesSearch(request)
          && (authorFilter === 'all' || (authorFilter === 'mine' ? isMine : !isMine))
          && (reviewFilter === 'all' || reviewStatus === reviewFilter);
      })
      .sort((left, right) => {
        if (sortOrder === 'created') return Date.parse(right.createdAt) - Date.parse(left.createdAt);
        if (sortOrder === 'number') return right.number - left.number;
        return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
      });
  }, [authorFilter, changeRequestViewerLogin, changeRequests, reviewFilter, searchTerm, sortOrder]);

  const selectedChangeRequestFile = useMemo(
    () => changeRequestFiles.find((file) => file.path === selectedChangeRequestFilePath) ?? null,
    [changeRequestFiles, selectedChangeRequestFilePath],
  );

  // A stale or failed snapshot is recovered by reloading the request, which
  // refreshes the head OID before fetching the refs again.
  const requestNumber = selectedChangeRequest?.number;
  const handleRetryPreview = useCallback((): void => {
    if (requestNumber === undefined) return;
    void selectChangeRequest(requestNumber);
  }, [requestNumber, selectChangeRequest]);

  const currentBranch = repoStatus?.branch ?? '';
  const canCreateChangeRequest = Boolean(currentBranch)
    && !MAIN_BRANCHES.includes(currentBranch.toLowerCase());
  const createDisabledReason = !currentBranch
    ? undefined
    : 'Switch to a feature branch to open a Change Request.';

  if (isLoadingChangeRequests && !changeRequestRepository && !changeRequestError) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-theme-muted">
        <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
        Loading Change Requests
      </div>
    );
  }

  if (changeRequestError) {
    const copy = changeRequestErrorCopy(changeRequestError.code);
    return (
      <div className="flex h-full items-center justify-center p-6">
        <section className="w-full max-w-xl border border-theme-default bg-theme-surface p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={ICON_SIZES.md} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <h1 className="text-lg font-medium text-theme-primary">{copy.title}</h1>
              <p className="mt-2 text-sm leading-6 text-theme-muted">{copy.detail}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {changeRequestError.code === 'gh_unavailable' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void installRequiredPackages()}
                loading={isInstallingPackages}
                disabled={isInstallingPackages}
              >
                <Github size={ICON_SIZES.sm} />
                Install GitHub CLI
              </Button>
            )}
            {changeRequestError.code === 'auth_required' && (
              <Button variant="secondary" size="sm" onClick={() => void startDeviceFlow()}>
                <Github size={ICON_SIZES.sm} />
                Connect GitHub
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => void loadChangeRequests()} disabled={isLoadingChangeRequests}>
              <RefreshCw size={ICON_SIZES.sm} />
              Try again
            </Button>
          </div>
            {deviceFlowError && <p className="mt-3 text-sm text-red-400">{deviceFlowError}</p>}
        </section>
          <GitHubDeviceFlowModal
            open={deviceFlow.isOpen}
            userCode={deviceFlow.userCode}
            verificationUrl={deviceFlow.verificationUrl}
            onComplete={handleDeviceFlowComplete}
            onOpenChange={handleDeviceFlowOpenChange}
          />
      </div>
    );
  }

  if (!selectedChangeRequest && changeRequestDetailError) {
    const copy = changeRequestErrorCopy(changeRequestDetailError.code);
    return (
      <div className="flex h-full items-center justify-center p-6" data-testid="change-request-detail-error">
        <section className="w-full max-w-xl border border-theme-default bg-theme-surface p-6">
          <div className="flex items-start gap-3">
            <AlertCircle size={ICON_SIZES.md} className="mt-0.5 shrink-0 text-amber-400" />
            <div>
              <h1 role="alert" className="text-lg font-medium text-theme-primary">{copy.title}</h1>
              <p className="mt-2 text-sm leading-6 text-theme-muted">{copy.detail}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-5" onClick={returnToChangeRequestOverview}>
            <ArrowLeft size={ICON_SIZES.sm} />
            Return to overview
          </Button>
        </section>
      </div>
    );
  }

  if (!selectedChangeRequest && isLoadingChangeRequestDetail) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-theme-muted" data-testid="change-request-detail-loading">
        <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
        Opening Change Request
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      {!selectedChangeRequest ? (
        <div className="flex h-full min-h-0 flex-col p-5">
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-theme-default bg-theme-surface p-6">
            <div className="relative min-w-56 flex-1">
              <Search size={ICON_SIZES.sm} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-theme-muted" />
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search Change Requests"
                aria-label="Search Change Requests"
                className="pl-9"
              />
            </div>
            <Select
              value={authorFilter}
              onValueChange={setAuthorFilter}
              options={[
                { value: 'all', label: 'All authors' },
                { value: 'mine', label: 'Your requests' },
                { value: 'team', label: 'Team requests' },
              ]}
              className="w-40"
            />
            <Select
              value={reviewFilter}
              onValueChange={setReviewFilter}
              options={[
                { value: 'all', label: 'All review states' },
                { value: 'approved', label: 'Approved' },
                { value: 'changes-requested', label: 'Changes requested' },
                { value: 'pending', label: 'Review pending' },
                { value: 'unavailable', label: 'Review unavailable' },
              ]}
              className="w-44"
            />
            <Select
              value={sortOrder}
              onValueChange={setSortOrder}
              options={[
                { value: 'updated', label: 'Recently updated' },
                { value: 'created', label: 'Recently created' },
                { value: 'number', label: 'Request number' },
              ]}
              className="w-40"
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Refresh Change Requests"
              title="Refresh Change Requests"
              onClick={() => void loadChangeRequests()}
              disabled={isLoadingChangeRequests}
            >
              <RefreshCw size={ICON_SIZES.sm} className={isLoadingChangeRequests ? 'animate-spin' : ''} />
            </Button>
            <span title={!canCreateChangeRequest ? createDisabledReason : undefined}>
              <Button
                variant="default"
                onClick={() => setIsCreateDialogOpen(true)}
                disabled={!canCreateChangeRequest}
              >
                <GitPullRequest size={ICON_SIZES.sm} />
                Create Change Request
              </Button>
            </span>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-theme-default bg-theme-surface p-6">
            <Table className="bg-theme-surface">
              <TableHeader className="sticky top-0 bg-theme-surface">
                <TableRow className="hover:bg-theme-surface">
                  <TableHead>Change Request</TableHead>
                  <TableHead>Author</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingChangeRequests && changeRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-theme-muted"><span className="inline-flex items-center gap-2"><Loader2 size={ICON_SIZES.sm} className="animate-spin" /> Loading Change Requests</span></TableCell></TableRow>
                ) : filteredRequests.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="py-10 text-center text-theme-muted">No Change Requests match the current search and filters.</TableCell></TableRow>
                ) : filteredRequests.map((request) => <ChangeRequestRow key={request.number} request={request} onSelect={selectChangeRequest} />)}
              </TableBody>
            </Table>
          </div>
          {changeRequestsMayHaveMore && <p className="pt-3 text-xs text-theme-muted">Showing the first 100 open Change Requests. Additional requests are available on GitHub.</p>}
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col" data-testid="change-request-detail">
          <ChangeRequestHeader
            request={selectedChangeRequest}
            summaryText={changeRequestFileSummaryText(changeRequestFiles)}
            isLoadingFiles={isLoadingChangeRequestDetail}
            selectedFilePath={selectedChangeRequestFilePath}
            onReturnToOverview={returnToChangeRequestOverview}
          />
          {selectedChangeRequestFilePath ? (
            <div className="min-h-0 flex-1" data-testid="change-request-viewer">
              <ChangeRequestPreview
                repoPath={repoPath}
                file={selectedChangeRequestFile}
                snapshot={changeRequestSnapshot}
                isPreparingSnapshot={isPreparingChangeRequestSnapshot}
                snapshotError={changeRequestSnapshotError}
                requestUrl={selectedChangeRequest.url}
                onRetry={handleRetryPreview}
              />
            </div>
          ) : <div className="min-h-0 flex-1" data-testid="change-request-viewer-empty" />}
        </div>
      )}
      {currentBranch && (
        <CreateChangeRequestDialog
          open={isCreateDialogOpen}
          onOpenChange={setIsCreateDialogOpen}
          sourceBranch={currentBranch}
          defaultTargetBranch={changeRequestRepository?.defaultBranch}
        />
      )}
    </div>
  );
}

function ChangeRequestHeader({
  request,
  summaryText,
  isLoadingFiles,
  selectedFilePath,
  onReturnToOverview,
}: {
  request: GitHubChangeRequest;
  summaryText: string;
  isLoadingFiles: boolean;
  selectedFilePath: string | null;
  onReturnToOverview: () => void;
}): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);
  const reviewStatus = reviewStatusFromDecision(request.reviewDecision);
  const reviewers = (request.reviewers ?? [])
    .map((reviewer) => reviewer.name || reviewer.login)
    .filter(Boolean)
    .join(', ');

  useEffect(() => {
    setIsExpanded(!selectedFilePath);
  }, [request.number, selectedFilePath]);

  return (
    <header className="shrink-0 border-b border-theme-default px-5 py-2" data-testid="change-request-header">
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Return to overview"
          title="Return to overview"
          onClick={onReturnToOverview}
        >
          <ArrowLeft size={ICON_SIZES.sm} />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <h1 className="min-w-0 truncate text-base font-medium text-theme-primary" title={request.title || 'Untitled Change Request'}>
            {request.title || 'Untitled Change Request'}
          </h1>
          <span className="shrink-0 text-sm text-theme-primary">#{request.number}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label={isExpanded ? 'Collapse Change Request details' : 'Expand Change Request details'}
            title={isExpanded ? 'Show less' : 'Show more'}
            aria-expanded={isExpanded}
            aria-controls={`change-request-details-${request.number}`}
            onClick={() => setIsExpanded((expanded) => !expanded)}
          >
            {isExpanded ? <ChevronUp size={ICON_SIZES.sm} /> : <ChevronDown size={ICON_SIZES.sm} />}
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {request.url && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open on GitHub"
              title="Open on GitHub"
              onClick={() => void openExternalUrl(request.url)}
            >
              <ExternalLink size={ICON_SIZES.sm} />
            </Button>
          )}
          <Button variant="default" size="sm" disabled title="Review actions are not available yet">Accept</Button>
          <Button variant="secondary" size="sm" disabled title="Review actions are not available yet">Reject</Button>
        </div>
      </div>
      <div
        id={`change-request-details-${request.number}`}
        className={`grid overflow-hidden transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
      >
        <div className="min-h-0">
          <p className="mt-2 text-sm text-theme-secondary" data-testid="change-request-file-summary">
            {isLoadingFiles ? 'Checking which project files changed' : summaryText}
          </p>
          {request.body && <p className="mt-2 max-w-4xl whitespace-pre-wrap text-sm leading-5 text-theme-muted">{request.body}</p>}
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm text-theme-muted sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <dt>Author</dt>
              <dd>{request.author?.login || 'Unknown author'}</dd>
            </div>
            <div>
              <dt>Branch direction</dt>
              <dd>{request.headRefName || 'Unknown branch'} to {request.baseRefName || 'Unknown branch'}</dd>
            </div>
            <div>
              <dt>Reviewers</dt>
              <dd>{reviewers || 'No reviewers assigned'}</dd>
            </div>
            <div>
              <dt>Review status</dt>
              <dd>{reviewStatusDetail(reviewStatus)}</dd>
            </div>
            <div>
              <dt>Merge readiness</dt>
              <dd>{mergeReadinessLabel(request.mergeStateStatus)}</dd>
            </div>
          </dl>
        </div>
      </div>
    </header>
  );
}

function ChangeRequestRow({ request, onSelect }: { request: GitHubChangeRequest; onSelect: (number: number) => Promise<void> }): JSX.Element {
  const reviewStatus = reviewStatusFromDecision(request.reviewDecision);
  const updatedAt = Number.isNaN(Date.parse(request.updatedAt))
    ? 'Recently'
    : new Date(request.updatedAt).toLocaleDateString();

  return (
    <TableRow>
      <TableCell className="min-w-64"><button type="button" className="text-left text-theme-primary hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-theme-primary" onClick={() => void onSelect(request.number)}>{request.title || 'Untitled Change Request'} <span className="text-theme-muted">#{request.number}</span></button></TableCell>
      <TableCell>{request.author.login || 'Unknown author'}</TableCell>
      <TableCell className="font-mono text-xs text-theme-secondary">{request.headRefName} to {request.baseRefName}</TableCell>
      <TableCell><Badge variant={reviewStatus === 'approved' ? 'success' : reviewStatus === 'changes-requested' ? 'warning' : 'outline'}>{reviewStatusLabel(reviewStatus)}</Badge></TableCell>
      <TableCell className="whitespace-nowrap text-theme-muted">{updatedAt}</TableCell>
    </TableRow>
  );
}

export default memo(ReviewsPage);
