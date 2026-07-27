import { memo, useCallback, useEffect, useState } from 'react';
import { AlertCircle, Github, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '../../../shared/ui';
import { ICON_SIZES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import GitHubDeviceFlowModal from '../../auth/components/GitHubDeviceFlowModal';
import { useGitHubDeviceFlow } from '../../auth/hooks/useGitHubDeviceFlow';
import type { GitHubChangeRequestErrorCode } from '../../../domain/repo/context/RepoContext.types';

function errorCopy(code: GitHubChangeRequestErrorCode): { title: string; detail: string } {
  switch (code) {
    case 'gh_unavailable':
      return {
        title: 'GitHub tools are required',
        detail: 'Install the GitHub CLI to browse Change Requests for this project.',
      };
    case 'auth_required':
      return {
        title: 'Connect GitHub to continue',
        detail: 'Connect GitHub from Settings, then return here to refresh Change Requests.',
      };
    case 'host_unsupported':
      return {
        title: 'This GitHub host is not supported yet',
        detail: 'Change Requests currently support projects connected to github.com only.',
      };
    case 'origin_missing':
      return {
        title: 'This project has no primary GitHub connection',
        detail: 'Add an origin connection for this project before using Change Requests.',
      };
    case 'origin_not_github':
      return {
        title: 'This project is not connected to GitHub',
        detail: 'Change Requests are currently available only for GitHub-connected projects.',
      };
    case 'repository_unresolved':
      return {
        title: 'We could not identify this GitHub project',
        detail: 'Check the origin connection and your GitHub access, then try again.',
      };
    case 'permission_denied':
      return {
        title: 'GitHub did not grant access to this project',
        detail: 'Ask a project administrator to confirm your GitHub permissions.',
      };
    case 'network_unavailable':
      return {
        title: 'GitHub could not be reached',
        detail: 'Check your connection and try again.',
      };
    case 'rate_limited':
      return {
        title: 'GitHub is temporarily limiting requests',
        detail: 'Wait a moment, then refresh Change Requests.',
      };
    default:
      return {
        title: 'Change Requests could not be loaded',
        detail: 'Try refreshing. If this continues, check the GitHub connection in Settings.',
      };
  }
}

function ReviewsPage(): JSX.Element {
  const [deviceFlowError, setDeviceFlowError] = useState<string | null>(null);
  const {
    changeRequestRepository,
    changeRequests,
    changeRequestsMayHaveMore,
    isLoadingChangeRequests,
    changeRequestError,
    loadChangeRequests,
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

  if (isLoadingChangeRequests && !changeRequestRepository && !changeRequestError) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-theme-muted">
        <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
        Loading Change Requests
      </div>
    );
  }

  if (changeRequestError) {
    const copy = errorCopy(changeRequestError.code);
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

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-theme-default pb-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Reviews</p>
            <h1 className="mt-1 text-xl font-medium text-theme-primary">Change Requests</h1>
            {changeRequestRepository && (
              <p className="mt-2 text-sm text-theme-muted">{changeRequestRepository.nameWithOwner}</p>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void loadChangeRequests()} disabled={isLoadingChangeRequests}>
            <RefreshCw size={ICON_SIZES.sm} className={isLoadingChangeRequests ? 'animate-spin' : ''} />
            Refresh
          </Button>
        </div>

        <section className="mt-6 border border-theme-default bg-theme-surface p-5">
          <h2 className="text-base font-medium text-theme-primary">Open Change Requests</h2>
          {changeRequests.length === 0 ? (
            <p className="mt-2 text-sm leading-6 text-theme-muted">
              There are no open Change Requests in this project right now.
            </p>
          ) : (
            <p className="mt-2 text-sm leading-6 text-theme-muted">
              Select a Change Request from the sidebar to inspect its files and review status in the next phase.
            </p>
          )}
          {changeRequestsMayHaveMore && (
            <p className="mt-3 text-sm text-theme-muted">
              Showing the first 100 open Change Requests. Additional requests are available on GitHub.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default memo(ReviewsPage);
