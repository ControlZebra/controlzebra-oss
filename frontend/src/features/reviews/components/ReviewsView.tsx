import { memo } from 'react';
import { ExternalLink, FileCode2, Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import { openExternalUrl } from '../../../shared/runtime/browser';
import { Button } from '../../../shared/ui';
import { changeRequestErrorCopy, changeRequestFileStatusLabel } from '../lib/change-request-presentation';

function fileNameFromPath(path: string): string {
  return path.split('/').pop() || path;
}

function ReviewsView(): JSX.Element {
  const {
    selectedChangeRequest,
    changeRequestFiles,
    changeRequestTotalFiles,
    isLoadingChangeRequestDetail,
    changeRequestDetailError,
    isChangeRequestFilesTruncated,
    selectedChangeRequestFilePath,
    selectChangeRequestFile,
  } = useRepo();

  if (!selectedChangeRequest) {
    return <p className="px-3 py-4 text-sm leading-6 text-theme-muted">Select a Change Request to see its changed files.</p>;
  }

  const requestUrl = selectedChangeRequest.url;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-theme-default px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-theme-muted">Changed files</p>
        {changeRequestFiles.length > 0 && (
          <p className="mt-1 text-xs text-theme-muted">
            {isChangeRequestFilesTruncated
              ? `Showing ${changeRequestFiles.length} of ${changeRequestTotalFiles}`
              : `${changeRequestFiles.length} ${changeRequestFiles.length === 1 ? 'file' : 'files'}`}
          </p>
        )}
      </div>

      {isLoadingChangeRequestDetail && (
        <div className="flex items-center gap-2 px-3 py-4 text-sm text-theme-muted">
          <Loader2 size={ICON_SIZES.sm} className="animate-spin" />
          Loading changed files
        </div>
      )}

      {changeRequestDetailError && (
        <p role="alert" className="px-3 py-4 text-sm leading-6 text-red-400">
          {changeRequestErrorCopy(changeRequestDetailError.code).detail}
        </p>
      )}

      {isChangeRequestFilesTruncated && (
        <div className="border-b border-theme-default px-3 py-3" data-testid="change-request-truncation-banner">
          <p className="text-xs leading-5 text-amber-400">
            GitHub returned a partial file list. Review the remaining files on GitHub.
          </p>
          {requestUrl && (
            <Button variant="ghost" size="sm" className="mt-2 w-full justify-start" onClick={() => void openExternalUrl(requestUrl)}>
              <ExternalLink size={ICON_SIZES.sm} />
              Open on GitHub
            </Button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {changeRequestFiles.map((file) => (
          <button
            key={file.path}
            type="button"
            aria-current={selectedChangeRequestFilePath === file.path ? 'true' : undefined}
            onClick={() => selectChangeRequestFile(selectedChangeRequestFilePath === file.path ? null : file.path)}
            className="flex w-full items-start gap-2 border-b border-theme-default px-3 py-2.5 text-left hover:bg-theme-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-theme-primary aria-[current=true]:bg-theme-muted"
          >
            <FileCode2 size={ICON_SIZES.xs} className="mt-0.5 shrink-0 text-theme-muted" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-theme-primary">{fileNameFromPath(file.path)}</span>
              <span className="mt-0.5 block break-all text-xs text-theme-muted">{file.path}</span>
              <span className="mt-1 block text-xs text-theme-muted">{changeRequestFileStatusLabel(file.status)} · +{file.additions} −{file.deletions}</span>
            </span>
          </button>
        ))}
        {!isLoadingChangeRequestDetail && !changeRequestDetailError && changeRequestFiles.length === 0 && <p className="px-3 py-4 text-sm text-theme-muted">No changed files were returned by GitHub.</p>}
      </div>
    </div>
  );
}

export default memo(ReviewsView);
