import { memo, useMemo } from 'react';
import { GitPullRequest, Loader2, RefreshCw } from 'lucide-react';

import { Button } from '../../../shared/ui';
import { ICON_SIZES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import type { GitHubChangeRequest } from '../../../domain/repo/context/RepoContext.types';

function RequestRow({ request }: { request: GitHubChangeRequest }): JSX.Element {
  const updatedAt = Number.isNaN(Date.parse(request.updatedAt))
    ? 'Updated recently'
    : `Updated ${new Date(request.updatedAt).toLocaleDateString()}`;

  return (
    <div className="border-b border-theme-default px-3 py-2.5 last:border-b-0">
      <div className="flex items-start gap-2">
        <GitPullRequest size={ICON_SIZES.xs} className="mt-0.5 shrink-0 text-theme-muted" />
        <div className="min-w-0">
          <p className="truncate text-sm text-theme-primary">{request.title || 'Untitled Change Request'}</p>
          <p className="mt-0.5 truncate text-xs text-theme-muted">
            #{request.number} by {request.author.login || 'Unknown author'}
          </p>
          <p className="mt-0.5 text-xs text-theme-muted">{updatedAt}</p>
        </div>
      </div>
    </div>
  );
}

function RequestSection({ title, requests }: { title: string; requests: GitHubChangeRequest[] }): JSX.Element | null {
  if (requests.length === 0) return null;

  return (
    <section>
      <h3 className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-theme-muted">{title}</h3>
      <div className="border-y border-theme-default">
        {requests.map((request) => <RequestRow key={request.number} request={request} />)}
      </div>
    </section>
  );
}

function ReviewsView(): JSX.Element {
  const {
    changeRequestViewerLogin,
    changeRequests,
    omittedExternalChangeRequestCount,
    isLoadingChangeRequests,
    changeRequestError,
    loadChangeRequests,
  } = useRepo();

  const { teamRequests, personalRequests } = useMemo(() => {
    const viewerLogin = changeRequestViewerLogin.toLocaleLowerCase();
    const personalRequests = changeRequests.filter(
      (request) => request.author.login.toLocaleLowerCase() === viewerLogin,
    );
    return {
      personalRequests,
      teamRequests: changeRequests.filter(
        (request) => request.author.login.toLocaleLowerCase() !== viewerLogin,
      ),
    };
  }, [changeRequestViewerLogin, changeRequests]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs text-theme-muted">
          {changeRequests.length} open {changeRequests.length === 1 ? 'request' : 'requests'}
        </span>
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
      </div>

      {isLoadingChangeRequests && changeRequests.length === 0 && !changeRequestError && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-theme-muted">
          <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
          Loading Change Requests
        </div>
      )}

      {!isLoadingChangeRequests && !changeRequestError && changeRequests.length === 0 && (
        <p className="px-3 py-4 text-sm text-theme-muted">No open Change Requests in this project.</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <RequestSection title="Team Change Requests" requests={teamRequests} />
        <RequestSection title="Your requests" requests={personalRequests} />
        {omittedExternalChangeRequestCount > 0 && (
          <p className="px-3 py-3 text-xs text-theme-muted">
            Some external Change Requests are available on GitHub.
          </p>
        )}
      </div>
    </div>
  );
}

export default memo(ReviewsView);
