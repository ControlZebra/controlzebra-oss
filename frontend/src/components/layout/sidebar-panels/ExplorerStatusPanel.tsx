/**
 * ExplorerStatusPanel - Unified status panel for explorer sidebar.
 * 
 * Consolidates: SidebarNoRepoPanel, SidebarSyncedPanel, SidebarPushPanel, SidebarMergePanel
 * into a single component with consistent visual structure.
 * 
 * Visual structure:
 * - Icon in colored circle
 * - Title
 * - Subtitle
 * - Optional action button
 */
import { memo, type CSSProperties, type ReactNode } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  Save, 
  GitBranch,
  GitPullRequest,
  Cloud,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { ICON_STYLES } from '../../../lib/gitHelpers';
import { Button } from '../../ui';
import { toast } from 'sonner';

// ============================================================================
// Types
// ============================================================================

type StatusType = 'noRepo' | 'synced' | 'push' | 'featureBranch';

interface PanelConfig {
  Icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

interface PanelLayoutProps {
  type: StatusType;
  title: string;
  subtitle: ReactNode;
  children?: ReactNode;
}

interface ExplorerStatusPanelProps {
  status: StatusType;
  folderName?: string;
  branchName?: string;
  repoPath?: string;
  ahead?: number;
  hasUpstream?: boolean;
  totalLocalCommits?: number;
  onInitialize?: () => void;
  onSync?: () => void;
  isLoading?: boolean;
  isSyncing?: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

// Panel type configurations
const PANEL_CONFIGS: Record<StatusType, PanelConfig> = {
  noRepo: {
    Icon: AlertTriangle,
    iconBg: 'bg-yellow-500/10',
    iconColor: 'text-yellow-500',
  },
  synced: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
  push: {
    Icon: Save,
    iconBg: 'bg-blue-500/10',
    iconColor: 'text-blue-400',
  },
  featureBranch: {
    Icon: CheckCircle2,
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
};

// ============================================================================
// Components
// ============================================================================

/**
 * Base panel layout - shared visual structure for all status types
 */
function PanelLayout({ type, title, subtitle, children }: PanelLayoutProps): JSX.Element {
  const config = PANEL_CONFIGS[type];
  const { Icon, iconBg, iconColor } = config;

  return (
    <div className="p-4 text-center">
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-full ${iconBg} mb-3`}>
        <Icon style={ICON_STYLES.lg as CSSProperties} className={iconColor} />
      </div>
      <p className="text-theme-primary text-sm font-medium mb-1">{title}</p>
      <p className="text-theme-muted text-xs mb-4">{subtitle}</p>
      {children}
    </div>
  );
}

/**
 * ExplorerStatusPanel - Renders the appropriate status panel based on repo state.
 */
function ExplorerStatusPanel({
  status,
  folderName,
  branchName,
  repoPath,
  ahead = 0,
  hasUpstream = true,
  totalLocalCommits = 0,
  onInitialize,
  onSync,
  isLoading = false,
  isSyncing = false,
}: ExplorerStatusPanelProps): JSX.Element {
  const handleCreateMergeRequest = (): void => {
    toast.info('Merge request creation coming soon!');
  };

  switch (status) {
    case 'noRepo':
      return (
        <PanelLayout
          type="noRepo"
          title="No Version Control"
          subtitle={<><span className="font-medium">{folderName}</span> is not tracked</>}
        >
          <Button 
            onClick={onInitialize} 
            loading={isLoading}
            size="sm"
            className="w-full"
          >
            <GitBranch style={ICON_STYLES.sm as CSSProperties} />
            Start Tracking
          </Button>
        </PanelLayout>
      );

    case 'push': {
      const pendingCount = hasUpstream ? ahead : totalLocalCommits;
      return (
        <PanelLayout
          type="push"
          title={`${pendingCount} snapshot${pendingCount !== 1 ? 's' : ''} pending`}
          subtitle={hasUpstream ? 'Ready to sync' : 'Branch not published'}
        >
          <Button 
            onClick={onSync} 
            loading={isSyncing} 
            size="sm"
            variant="secondary"
            className="w-full"
          >
            {hasUpstream ? (
              <Cloud style={ICON_STYLES.sm as CSSProperties} />
            ) : (
              <Upload style={ICON_STYLES.sm as CSSProperties} />
            )}
            {hasUpstream ? 'Sync' : 'Publish'}
          </Button>
        </PanelLayout>
      );
    }

    case 'featureBranch':
      return (
        <PanelLayout
          type="featureBranch"
          title="Branch synced"
          subtitle={<><span className="font-mono">{branchName}</span> is up to date</>}
        >
          <Button 
            onClick={handleCreateMergeRequest}
            size="sm"
            variant="outline"
            className="w-full"
          >
            <GitPullRequest style={ICON_STYLES.sm as CSSProperties} />
            Merge Request
          </Button>
        </PanelLayout>
      );

    case 'synced':
    default: {
      const displayName = repoPath?.split('/').pop() || 'Repository';
      return (
        <PanelLayout
          type="synced"
          title="All caught up"
          subtitle={<>No changes in <span className="font-medium">{displayName}</span></>}
        />
      );
    }
  }
}

export default memo(ExplorerStatusPanel);
