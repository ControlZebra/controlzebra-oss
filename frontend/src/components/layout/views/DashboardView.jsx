/**
 * DashboardView - Sidebar content for Dashboard.
 * Shows quick navigation and summary info.
 */
import { memo } from 'react';
import { Home, FolderOpen, GitBranch, Clock, Settings } from 'lucide-react';
import { ICON_SIZES, VIEWS } from '../../../constants';
import { useLayout, useRepo } from '../../../context';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

const NavItem = memo(function NavItem({ icon: Icon, label, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-gray-700/50 transition-colors"
    >
      <Icon style={iconStyle} className="text-gray-400 shrink-0" />
      <span className="flex-1 text-sm truncate">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
          {badge}
        </span>
      )}
    </button>
  );
});

function DashboardView() {
  const { setActiveView } = useLayout();
  const { repoPath, repoStatus } = useRepo();

  const changedFilesCount = repoStatus?.changedFiles?.length || 0;

  return (
    <div className="flex flex-col h-full">
      {/* Current repo info */}
      {repoPath && (
        <div className="p-3 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <FolderOpen style={iconStyle} className="text-yellow-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-gray-200 text-sm font-medium truncate">
                {repoPath.split('/').pop()}
              </p>
              <p className="text-gray-500 text-xs truncate">{repoPath}</p>
            </div>
          </div>
          {repoStatus?.branch && (
            <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
              <GitBranch style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
              <span>{repoStatus.branch}</span>
            </div>
          )}
        </div>
      )}

      {/* Quick navigation */}
      <div className="py-2">
        <p className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wide">Navigate</p>
        <NavItem
          icon={Home}
          label="Dashboard"
          onClick={() => setActiveView(VIEWS.DASHBOARD)}
        />
        <NavItem
          icon={GitBranch}
          label="Source Control"
          onClick={() => setActiveView(VIEWS.CHANGES)}
          badge={changedFilesCount}
        />
        <NavItem
          icon={Clock}
          label="History"
          onClick={() => setActiveView(VIEWS.HISTORY)}
        />
        <NavItem
          icon={Settings}
          label="Settings"
          onClick={() => setActiveView(VIEWS.SETTINGS)}
        />
      </div>
    </div>
  );
}

export default memo(DashboardView);
