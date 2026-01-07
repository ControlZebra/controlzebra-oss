/**
 * RepositoryPanel - Bottom panel showing repository information.
 * Displays technical data: repo name, branch, commits, branches count, remote URL.
 */
import { memo, useEffect, useState, useCallback } from 'react';
import { Folder } from 'lucide-react';
import { Browser } from '@wailsio/runtime';
import { ICON_SIZES } from '../../../constants';
import { useRepo } from '../../../context';
import { GetRemoteURL } from '../../../../bindings/changeme/services/gitservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

function RepositoryPanel() {
  const { repoPath, repoInfo, repoStatus, commits, branches, refreshBranches } = useRepo();
  const [remoteURL, setRemoteURL] = useState('');

  // Fetch branches and remote URL when panel mounts
  useEffect(() => {
    if (repoPath) {
      if (!branches) {
        refreshBranches();
      }
      GetRemoteURL(repoPath).then(url => setRemoteURL(url || '')).catch(() => setRemoteURL(''));
    }
  }, [repoPath, branches, refreshBranches]);

  // Convert git URL to browser URL and open in system browser
  const handleRemoteClick = useCallback((e) => {
    e.preventDefault();
    if (!remoteURL) return;
    
    // Convert SSH URL to HTTPS if needed: git@github.com:user/repo.git -> https://github.com/user/repo
    const browserURL = remoteURL
      .replace(/^git@([^:]+):/, 'https://$1/')
      .replace(/\.git$/, '');
    
    Browser.OpenURL(browserURL);
  }, [remoteURL]);

  if (!repoPath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-theme-muted">
        <Folder style={{ width: ICON_SIZES.lg * 2, height: ICON_SIZES.lg * 2 }} className="mb-3 opacity-50" />
        <p className="text-sm font-medium">No Repository Open</p>
        <p className="text-xs mt-1">Open a folder to view repository info</p>
      </div>
    );
  }

  const repoName = repoPath.split('/').pop();
  const currentBranch = repoInfo?.branch || repoStatus?.branch || 'unknown';
  const commitCount = commits?.length || 0;
  const localBranchCount = branches?.local?.length || 0;
  const remoteBranchCount = branches?.remote?.length || 0;
  const changedFilesCount = repoStatus?.changedFiles?.length || 0;

  return (
    <div className="h-full p-3 overflow-auto text-xs">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span><span className="text-theme-muted">Name:</span> <span className="text-theme-primary">{repoName}</span></span>
        <span><span className="text-theme-muted">Branch:</span> <span className="text-cyan-400">{currentBranch}</span></span>
        <span><span className="text-theme-muted">Commits:</span> <span className="text-theme-primary">{commitCount}</span></span>
        <span><span className="text-theme-muted">Local branches:</span> <span className="text-theme-primary">{localBranchCount}</span></span>
        <span><span className="text-theme-muted">Remote branches:</span> <span className="text-theme-primary">{remoteBranchCount}</span></span>
        <span><span className="text-theme-muted">Pending changes:</span> <span className={changedFilesCount > 0 ? 'text-yellow-400' : 'text-theme-primary'}>{changedFilesCount}</span></span>
        {remoteURL && (
          <span>
            <span className="text-theme-muted">Remote:</span>{' '}
            <button 
              onClick={handleRemoteClick}
              className="text-blue-400 hover:text-blue-300 hover:underline cursor-pointer"
            >
              {remoteURL}
            </button>
          </span>
        )}
      </div>
      <div className="mt-2 text-theme-muted truncate" title={repoPath}>
        <span className="text-theme-muted">Local:</span> {repoPath}
      </div>
    </div>
  );
}

export default memo(RepositoryPanel);
