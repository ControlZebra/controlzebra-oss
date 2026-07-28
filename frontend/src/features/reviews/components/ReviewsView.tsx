import { memo, useMemo } from 'react';
import { ChevronDown, ExternalLink, FileCode2, Folder, Loader2 } from 'lucide-react';

import { ICON_SIZES } from '../../../shared/constants';
import { useRepo } from '../../../context';
import { openExternalUrl } from '../../../shared/runtime/browser';
import { Button } from '../../../shared/ui';
import { changeRequestErrorCopy } from '../lib/change-request-presentation';

import type { GitHubChangeRequestFile } from '../../../domain/repo/context/RepoContext.types';

interface ChangedFileTreeNode {
  files: GitHubChangeRequestFile[];
  folders: Map<string, ChangedFileTreeNode>;
}

function buildChangedFileTree(files: GitHubChangeRequestFile[]): ChangedFileTreeNode {
  const root: ChangedFileTreeNode = { files: [], folders: new Map() };

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) continue;

    let node = root;
    for (const segment of segments) {
      let folder = node.folders.get(segment);
      if (!folder) {
        folder = { files: [], folders: new Map() };
        node.folders.set(segment, folder);
      }
      node = folder;
    }
    node.files.push(file);
  }

  return root;
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
  const changedFileTree = useMemo(() => buildChangedFileTree(changeRequestFiles), [changeRequestFiles]);

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
        <ChangedFileTree
          node={changedFileTree}
          depth={0}
          selectedFilePath={selectedChangeRequestFilePath}
          onSelectFile={selectChangeRequestFile}
        />
        {!isLoadingChangeRequestDetail && !changeRequestDetailError && changeRequestFiles.length === 0 && <p className="px-3 py-4 text-sm text-theme-muted">No changed files were returned by GitHub.</p>}
      </div>
    </div>
  );
}

function ChangedFileTree({
  node,
  depth,
  selectedFilePath,
  onSelectFile,
}: {
  node: ChangedFileTreeNode;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (path: string | null) => void;
}): JSX.Element {
  const folders = [...node.folders.entries()].sort(([left], [right]) => left.localeCompare(right));
  const files = [...node.files].sort((left, right) => left.path.localeCompare(right.path));

  return (
    <>
      {folders.map(([name, folder]) => (
        <div key={name}>
          <div className="flex items-center gap-1.5 py-1.5 pr-3 text-sm text-theme-primary" style={{ paddingLeft: `${12 + depth * 16}px` }}>
            <ChevronDown size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />
            <Folder size={ICON_SIZES.sm} className="shrink-0 text-theme-muted" />
            <span className="truncate">{name}</span>
          </div>
          <ChangedFileTree node={folder} depth={depth + 1} selectedFilePath={selectedFilePath} onSelectFile={onSelectFile} />
        </div>
      ))}
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          aria-label={file.path}
          aria-current={selectedFilePath === file.path ? 'true' : undefined}
          onClick={() => onSelectFile(selectedFilePath === file.path ? null : file.path)}
          className="flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-sm hover:bg-theme-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-theme-primary aria-[current=true]:bg-theme-muted"
          style={{ paddingLeft: `${30 + depth * 16}px` }}
        >
          <FileCode2 size={ICON_SIZES.xs} className="shrink-0 text-theme-muted" />
          <span className="truncate text-theme-primary">{file.path.split('/').pop() || file.path}</span>
        </button>
      ))}
    </>
  );
}

export default memo(ReviewsView);
