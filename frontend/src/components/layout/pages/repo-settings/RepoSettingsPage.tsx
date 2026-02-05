/**
 * RepoSettingsPage - Main area content for Repository Settings view.
 * Shows repository-specific settings forms organized by user perspective.
 */
import { memo, useState, useEffect, useCallback, type CSSProperties, type ChangeEvent, type KeyboardEvent, type JSX } from 'react';
import { 
  Settings, 
  RefreshCw, 
  Play, 
  AlertTriangle, 
  Shield, 
  Wrench, 
  HardDrive, 
  Clock, 
  Cloud, 
  Trash2,
  Zap,
  GitBranch,
  RotateCcw,
  Search,
  FileText,
  CheckCircle2,
  Plus,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { REPO_SETTINGS_CATEGORIES, ICON_SIZES } from '../../../../constants';
import { useLayout, useRepo } from '../../../../context';
import { 
  Button, 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent,
  Input,
  Label,
  Switch,
  Badge,
} from '../../../ui';
import {
  GetSettings,
  UpdateBackgroundTask,
  UpdateFetchSettings,
  UpdateLFSSettings,
  UpdateMaintenanceSettings,
  UpdateProtectedBranches,
  RunTaskNow,
  GetTaskStatuses,
  DiagnoseRepository,
  RemoveStaleLocks,
  AbortMerge,
  AbortCherryPick,
  RepairRepository,
  ResetToDefaults,
  RecoverFromDetachedHead,
} from '../../../../../bindings/controlzebra/services/repositorysettingsservice';
import {
  AbortRevert,
  AbortBisect,
  AbortAM,
  AbortCurrentOperation,
} from '../../../../../bindings/controlzebra/services/gitservice';
import {
  IsLFSInstalled,
  IsLFSEnabled,
  InitializeLFS,
  GetPresetPatterns,
  GetTrackedPatterns,
  TrackPattern,
  UntrackPattern,
} from '../../../../../bindings/controlzebra/services/lfsservice';
import { BackgroundTaskType, PresetPattern, TrackedPattern } from '../../../../../bindings/controlzebra/services/models';

// ============================================================================
// Types
// ============================================================================

interface TaskConfig {
  enabled: boolean;
  intervalMinutes: number;
}

interface TaskStatus {
  isRunning?: boolean;
  lastRun?: string;
  lastResult?: {
    success: boolean;
    error?: string;
  };
}

interface TaskStatuses {
  [key: string]: TaskStatus;
}

interface FetchSettings {
  fetchAllRemotes: boolean;
  pruneStaleBranches: boolean;
  fetchTags: boolean;
}

interface LFSSettings {
  autoFetch: boolean;
  fetchRecentDays: number;
  autoPrune: boolean;
  pruneKeepDays: number;
}

interface ProtectedBranchesSettings {
  protectedBranches: string[];
  warnOnDirectCommit: boolean;
  requireConfirmation: boolean;
}

interface MaintenanceSettings {
  commitGraph: boolean;
  packRefs: boolean;
  looseObjects: boolean;
}

interface RepoSettings {
  fetchTask?: TaskConfig;
  lfsFetchTask?: TaskConfig;
  maintenanceTask?: TaskConfig;
  fetchSettings?: FetchSettings;
  lfsSettings?: LFSSettings;
  protectedBranches?: ProtectedBranchesSettings;
  maintenanceSettings?: MaintenanceSettings;
  [key: string]: unknown;
}

interface DiagnosticsResult {
  issues?: string[];
  suggestions?: string[];
  hasStaleLocks?: boolean;
  hasMergeConflict?: boolean;
  hasRebaseInProgress?: boolean;
  hasCherryPickInProgress?: boolean;
  hasRevertInProgress?: boolean;
  hasBisectInProgress?: boolean;
  hasAMInProgress?: boolean;
  isDetachedHead?: boolean;
}

interface SettingRowProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

interface IntervalInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}

interface BackgroundTaskCardProps {
  taskType: BackgroundTaskType;
  taskKey: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ style?: CSSProperties; className?: string }>;
  defaultInterval: number;
  settings: RepoSettings;
  taskStatuses: TaskStatuses;
  runningTask: BackgroundTaskType | null;
  onToggle: (taskType: BackgroundTaskType, enabled: boolean) => void;
  onIntervalChange: (taskType: BackgroundTaskType, interval: number) => void;
  onRunNow: (taskType: BackgroundTaskType) => void;
}

interface PanelProps {
  settings: RepoSettings;
  onUpdate: () => void;
  repoPath: string;
}

interface DetachedHeadRecoveryProps {
  repoPath: string;
  onRecovered: () => void;
  isFixing: boolean;
  setIsFixing: (fixing: boolean) => void;
}

interface TroubleshootingPanelProps {
  repoPath: string;
}

const iconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconStyleSm: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// ============================================================================
// Setting Row Component - Reusable row with switch toggle
// ============================================================================
const SettingRow = memo(function SettingRow({ 
  label, 
  description, 
  checked, 
  onChange, 
  disabled = false 
}: SettingRowProps): JSX.Element {
  return (
    <div className="flex items-center justify-between py-3 border-b border-theme-default last:border-b-0">
      <div className="flex-1 pr-4">
        <p className="text-theme-primary text-sm font-medium">{label}</p>
        {description && <p className="text-theme-muted text-xs mt-0.5">{description}</p>}
      </div>
      <Switch 
        checked={checked} 
        onCheckedChange={onChange}
        disabled={disabled}
      />
    </div>
  );
});

// ============================================================================
// Interval Input Component - For timer settings
// ============================================================================
const IntervalInput = memo(function IntervalInput({ 
  label, 
  value, 
  onChange, 
  min = 1,
  max = 120,
  unit = 'minutes',
  disabled = false,
}: IntervalInputProps): JSX.Element {
  return (
    <div className="flex items-center gap-3 py-2">
      <Label className="text-theme-primary text-sm min-w-32">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => 
            onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))
          }
          min={min}
          max={max}
          disabled={disabled}
          className="w-20 h-8 text-sm"
        />
        <span className="text-theme-muted text-sm">{unit}</span>
      </div>
    </div>
  );
});

// ============================================================================
// Background Task Card - Reusable component for scheduled tasks
// ============================================================================
const BackgroundTaskCard = memo(function BackgroundTaskCard({
  taskType,
  taskKey,
  label,
  description,
  icon: Icon,
  defaultInterval,
  settings,
  taskStatuses,
  runningTask,
  onToggle,
  onIntervalChange,
  onRunNow,
}: BackgroundTaskCardProps): JSX.Element {
  const config = settings[taskKey] as TaskConfig | undefined || { enabled: false, intervalMinutes: defaultInterval };
  const status = taskStatuses[taskType];

  return (
    <Card className="bg-theme-surface">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon style={iconStyleSm} className="text-theme-muted" />
            <CardTitle className="text-sm">{label}</CardTitle>
            {status?.isRunning && (
              <Badge variant="outline" className="text-xs">Running</Badge>
            )}
          </div>
          <Switch 
            checked={config.enabled}
            onCheckedChange={(enabled: boolean) => onToggle(taskType, enabled)}
          />
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <IntervalInput
            label="Run every"
            value={config.intervalMinutes}
            onChange={(val: number) => onIntervalChange(taskType, val)}
            disabled={!config.enabled}
            min={1}
            max={120}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => onRunNow(taskType)}
            disabled={runningTask === taskType}
            loading={runningTask === taskType}
          >
            <Play style={iconStyleSm} />
            Run Now
          </Button>
        </div>
        {status?.lastRun && (
          <p className="text-theme-muted text-xs mt-2">
            Last run: {new Date(status.lastRun).toLocaleString()}
            {status.lastResult && !status.lastResult.success && (
              <span className="text-red-400 ml-2">• Failed</span>
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Remote Sync Settings Panel
// Combines: Auto-fetch background task + Fetch options
// ============================================================================
const RemoteSyncPanel = memo(function RemoteSyncPanel({ settings, onUpdate, repoPath }: PanelProps): JSX.Element {
  const [taskStatuses, setTaskStatuses] = useState<TaskStatuses>({});
  const [runningTask, setRunningTask] = useState<BackgroundTaskType | null>(null);

  const fetchSettings: FetchSettings = settings.fetchSettings || { 
    fetchAllRemotes: true, 
    pruneStaleBranches: true, 
    fetchTags: true 
  };

  const fetchStatuses = useCallback(async (): Promise<void> => {
    try {
      const statuses = await GetTaskStatuses();
      setTaskStatuses(statuses || {});
    } catch (err) {
      console.error('Failed to fetch task statuses:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const handleTaskToggle = async (taskType: BackgroundTaskType, enabled: boolean): Promise<void> => {
    try {
      const taskKey = 'fetchTask';
      const currentConfig = settings[taskKey] as TaskConfig | undefined || { enabled: false, intervalMinutes: 5 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  const handleIntervalChange = async (taskType: BackgroundTaskType, intervalMinutes: number): Promise<void> => {
    try {
      const taskKey = 'fetchTask';
      const currentConfig = settings[taskKey] as TaskConfig | undefined || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update interval: ${errorMessage}`);
    }
  };

  const handleRunNow = async (taskType: BackgroundTaskType): Promise<void> => {
    setRunningTask(taskType);
    try {
      const result = await RunTaskNow(repoPath, taskType);
      if (result.success) {
        toast.success('Sync completed');
      } else {
        toast.error(result.error || 'Sync failed');
      }
      fetchStatuses();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Sync failed: ${errorMessage}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleFetchSettingsChange = async (key: keyof FetchSettings, value: boolean): Promise<void> => {
    try {
      await UpdateFetchSettings(repoPath, {
        ...fetchSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Sync settings updated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Auto-sync task */}
      <BackgroundTaskCard
        taskType={BackgroundTaskType.TaskFetchAll}
        taskKey="fetchTask"
        label="Auto-sync with Remote"
        description="Automatically check for updates from the remote repository"
        icon={Cloud}
        defaultInterval={5}
        settings={settings}
        taskStatuses={taskStatuses}
        runningTask={runningTask}
        onToggle={handleTaskToggle}
        onIntervalChange={handleIntervalChange}
        onRunNow={handleRunNow}
      />

      {/* Fetch options */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings style={iconStyle} className="text-theme-muted" />
            <CardTitle>Sync Options</CardTitle>
          </div>
          <CardDescription>Configure what gets synced from remote</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Sync all remotes"
            description="Fetch from all configured remotes, not just origin"
            checked={fetchSettings.fetchAllRemotes}
            onChange={(val: boolean) => handleFetchSettingsChange('fetchAllRemotes', val)}
          />
          <SettingRow
            label="Clean up deleted branches"
            description="Remove local references to branches deleted on remote"
            checked={fetchSettings.pruneStaleBranches}
            onChange={(val: boolean) => handleFetchSettingsChange('pruneStaleBranches', val)}
          />
          <SettingRow
            label="Sync tags"
            description="Download all tags from remote"
            checked={fetchSettings.fetchTags}
            onChange={(val: boolean) => handleFetchSettingsChange('fetchTags', val)}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Large Files (LFS) Panel
// Combines: LFS initialization + settings + tracked patterns + background fetch
// ============================================================================

interface LFSStatusState {
  isInstalled: boolean;
  isEnabled: boolean;
  version?: string;
  hasError: boolean;
  error?: string;
  loading: boolean;
}

interface LFSPanelState {
  presetPatterns: PresetPattern[];
  trackedPatterns: TrackedPattern[];
  selectedPresets: Set<string>;
  customPattern: string;
  isInitializing: boolean;
  isAddingPattern: boolean;
}

const LargeFilesPanel = memo(function LargeFilesPanel({ settings, onUpdate, repoPath }: PanelProps): JSX.Element {
  const [taskStatuses, setTaskStatuses] = useState<TaskStatuses>({});
  const [runningTask, setRunningTask] = useState<BackgroundTaskType | null>(null);
  
  // LFS status state
  const [lfsStatus, setLfsStatus] = useState<LFSStatusState>({
    isInstalled: false,
    isEnabled: false,
    loading: true,
    hasError: false,
  });
  
  // LFS panel state for patterns
  const [panelState, setPanelState] = useState<LFSPanelState>({
    presetPatterns: [],
    trackedPatterns: [],
    selectedPresets: new Set<string>(),
    customPattern: '',
    isInitializing: false,
    isAddingPattern: false,
  });

  const lfsSettings: LFSSettings = settings.lfsSettings || { 
    autoFetch: true, 
    fetchRecentDays: 7, 
    autoPrune: false, 
    pruneKeepDays: 30 
  };

  // Check LFS installation and enabled status
  const checkLFSStatus = useCallback(async (): Promise<void> => {
    try {
      setLfsStatus(prev => ({ ...prev, loading: true }));
      
      const [isInstalled, lfsInfo, presets, tracked] = await Promise.all([
        IsLFSInstalled(),
        IsLFSEnabled(repoPath),
        GetPresetPatterns(),
        GetTrackedPatterns(repoPath).catch(() => []),
      ]);
      
      setLfsStatus({
        isInstalled,
        isEnabled: lfsInfo.enabled,
        version: lfsInfo.version,
        hasError: lfsInfo.hasError,
        error: lfsInfo.error,
        loading: false,
      });
      
      setPanelState(prev => ({
        ...prev,
        presetPatterns: presets || [],
        trackedPatterns: tracked || [],
      }));
    } catch (err) {
      console.error('Failed to check LFS status:', err);
      setLfsStatus({
        isInstalled: false,
        isEnabled: false,
        loading: false,
        hasError: true,
        error: err instanceof Error ? err.message : 'Failed to check LFS status',
      });
    }
  }, [repoPath]);

  useEffect(() => {
    checkLFSStatus();
  }, [checkLFSStatus]);

  const fetchStatuses = useCallback(async (): Promise<void> => {
    try {
      const statuses = await GetTaskStatuses();
      setTaskStatuses(statuses || {});
    } catch (err) {
      console.error('Failed to fetch task statuses:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  // Initialize LFS for the repository
  const handleInitializeLFS = async (): Promise<void> => {
    setPanelState(prev => ({ ...prev, isInitializing: true }));
    try {
      const result = await InitializeLFS(repoPath);
      if (!result.success) {
        toast.error(result.error || 'Failed to initialize LFS');
        return;
      }
      
      // If there are selected presets, track them
      const selectedPatterns = Array.from(panelState.selectedPresets);
      for (const pattern of selectedPatterns) {
        await TrackPattern(repoPath, pattern);
      }
      
      toast.success(`Git LFS enabled${selectedPatterns.length > 0 ? ` with ${selectedPatterns.length} tracked patterns` : ''}`);
      await checkLFSStatus();
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to initialize LFS: ${errorMessage}`);
    } finally {
      setPanelState(prev => ({ ...prev, isInitializing: false }));
    }
  };

  // Toggle a preset pattern selection
  const handleTogglePreset = (pattern: string): void => {
    setPanelState(prev => {
      const newSelected = new Set(prev.selectedPresets);
      if (newSelected.has(pattern)) {
        newSelected.delete(pattern);
      } else {
        newSelected.add(pattern);
      }
      return { ...prev, selectedPresets: newSelected };
    });
  };

  // Add a new pattern (when LFS is already enabled)
  const handleAddPattern = async (pattern: string): Promise<void> => {
    if (!pattern.trim()) return;
    
    setPanelState(prev => ({ ...prev, isAddingPattern: true }));
    try {
      const result = await TrackPattern(repoPath, pattern.trim());
      if (!result.success) {
        toast.error(result.error || 'Failed to track pattern');
        return;
      }
      toast.success(`Now tracking "${pattern}"`);
      setPanelState(prev => ({ ...prev, customPattern: '' }));
      await checkLFSStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to track pattern: ${errorMessage}`);
    } finally {
      setPanelState(prev => ({ ...prev, isAddingPattern: false }));
    }
  };

  // Remove a tracked pattern
  const handleRemovePattern = async (pattern: string): Promise<void> => {
    try {
      const result = await UntrackPattern(repoPath, pattern);
      if (!result.success) {
        toast.error(result.error || 'Failed to untrack pattern');
        return;
      }
      toast.success(`Stopped tracking "${pattern}"`);
      await checkLFSStatus();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to untrack pattern: ${errorMessage}`);
    }
  };

  const handleTaskToggle = async (taskType: BackgroundTaskType, enabled: boolean): Promise<void> => {
    try {
      const currentConfig = settings.lfsFetchTask || { enabled: false, intervalMinutes: 10 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`LFS auto-download ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  const handleIntervalChange = async (taskType: BackgroundTaskType, intervalMinutes: number): Promise<void> => {
    try {
      const currentConfig = settings.lfsFetchTask || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update interval: ${errorMessage}`);
    }
  };

  const handleRunNow = async (taskType: BackgroundTaskType): Promise<void> => {
    setRunningTask(taskType);
    try {
      const result = await RunTaskNow(repoPath, taskType);
      if (result.success) {
        toast.success('LFS download completed');
      } else {
        toast.error(result.error || 'LFS download failed');
      }
      fetchStatuses();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`LFS download failed: ${errorMessage}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleLFSSettingsChange = async (key: keyof LFSSettings, value: boolean | number): Promise<void> => {
    try {
      await UpdateLFSSettings(repoPath, {
        ...lfsSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('LFS settings updated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  // Group presets by category
  const presetsByCategory = panelState.presetPatterns.reduce<Record<string, PresetPattern[]>>((acc, preset) => {
    const category = preset.category || 'other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(preset);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    industrial: 'Industrial Automation',
    archives: 'Archives',
    cad: 'CAD/CAM',
    media: 'Media Files',
    documents: 'Documents',
    other: 'Other',
  };

  // Loading state
  if (lfsStatus.loading) {
    return (
      <div className="space-y-4">
        <Card className="bg-theme-surface">
          <CardContent className="py-8">
            <div className="flex items-center justify-center gap-2 text-theme-muted">
              <RefreshCw style={iconStyle} className="animate-spin" />
              <span>Checking LFS status...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LFS not installed
  if (!lfsStatus.isInstalled) {
    return (
      <div className="space-y-4">
        <Card className="bg-theme-surface border-yellow-500/30">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle style={iconStyle} className="text-yellow-500" />
              <CardTitle className="text-yellow-500">Git LFS Not Installed</CardTitle>
            </div>
            <CardDescription>
              Git Large File Storage (LFS) is not installed on your system. LFS is required to efficiently 
              manage large binary files like industrial automation projects, CAD files, and images.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-theme-secondary rounded-lg p-4 space-y-2">
              <p className="text-theme-primary text-sm font-medium">To install Git LFS:</p>
              <div className="space-y-1">
                <p className="text-theme-muted text-sm">• <strong>macOS:</strong> <code className="bg-theme-base px-1.5 py-0.5 rounded text-xs">brew install git-lfs</code></p>
                <p className="text-theme-muted text-sm">• <strong>Windows:</strong> Download from <code className="bg-theme-base px-1.5 py-0.5 rounded text-xs">git-lfs.com</code></p>
                <p className="text-theme-muted text-sm">• <strong>Linux:</strong> <code className="bg-theme-base px-1.5 py-0.5 rounded text-xs">apt install git-lfs</code> or <code className="bg-theme-base px-1.5 py-0.5 rounded text-xs">yum install git-lfs</code></p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={checkLFSStatus}
                className="mt-3"
              >
                <RefreshCw style={iconStyleSm} />
                Check Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LFS installed but not enabled for this repo
  if (!lfsStatus.isEnabled) {
    return (
      <div className="space-y-4">
        {/* Enable LFS Card */}
        <Card className="bg-theme-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive style={iconStyle} className="text-theme-muted" />
              <div>
                <CardTitle>Enable Large File Support</CardTitle>
                {lfsStatus.version && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    {lfsStatus.version}
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription>
              Git LFS helps you manage large files like industrial automation projects (*.acd, *.L5X), 
              CAD files, and other binary formats. Enable LFS to keep your repository fast and efficient.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Preset pattern selection */}
            <div className="space-y-3">
              <p className="text-theme-primary text-sm font-medium">
                Select file types to track with LFS (optional):
              </p>
              
              {Object.entries(presetsByCategory).map(([category, patterns]) => (
                <div key={category} className="space-y-2">
                  <p className="text-theme-muted text-xs uppercase tracking-wide">
                    {categoryLabels[category] || category}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {patterns.map((preset) => {
                      const isSelected = panelState.selectedPresets.has(preset.pattern);
                      return (
                        <button
                          key={preset.pattern}
                          onClick={() => handleTogglePreset(preset.pattern)}
                          className={`
                            flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs
                            transition-colors border
                            ${isSelected 
                              ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' 
                              : 'bg-theme-secondary border-theme-default text-theme-muted hover:border-theme-hover hover:text-theme-primary'
                            }
                          `}
                          title={preset.description}
                        >
                          {isSelected && <Check style={{ width: 12, height: 12 }} />}
                          {preset.pattern}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              
              {panelState.selectedPresets.size > 0 && (
                <p className="text-theme-muted text-xs">
                  {panelState.selectedPresets.size} pattern{panelState.selectedPresets.size !== 1 ? 's' : ''} selected
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button
                onClick={handleInitializeLFS}
                disabled={panelState.isInitializing}
                loading={panelState.isInitializing}
              >
                <Zap style={iconStyleSm} />
                Enable LFS
              </Button>
              <p className="text-theme-muted text-xs">
                You can add more file patterns later
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LFS is enabled - show full settings
  return (
    <div className="space-y-4">
      {/* LFS Status */}
      <Card className="bg-theme-surface">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 style={iconStyle} className="text-green-500" />
              <CardTitle>Large File Support Enabled</CardTitle>
            </div>
            {lfsStatus.version && (
              <Badge variant="outline" className="text-xs">
                {lfsStatus.version}
              </Badge>
            )}
          </div>
          <CardDescription>
            Git LFS is active for this repository. Large binary files will be stored efficiently.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Tracked Patterns */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <FileText style={iconStyle} className="text-theme-muted" />
            <CardTitle>Tracked File Patterns</CardTitle>
          </div>
          <CardDescription>
            These file patterns are being managed by Git LFS. Add patterns for large files 
            that shouldn't be stored directly in the repository.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current tracked patterns */}
          {panelState.trackedPatterns.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {panelState.trackedPatterns.map((tracked) => (
                <Badge 
                  key={tracked.pattern} 
                  variant="outline"
                  className="flex items-center gap-1 px-2 py-1"
                >
                  <HardDrive style={{ width: 12, height: 12 }} />
                  {tracked.pattern}
                  <button
                    onClick={() => handleRemovePattern(tracked.pattern)}
                    className="ml-1 hover:text-red-400 transition-colors"
                    title="Stop tracking this pattern"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-theme-muted text-sm">
              No file patterns are being tracked yet. Add patterns below.
            </p>
          )}

          {/* Add new pattern */}
          <div className="space-y-3 pt-2 border-t border-theme-default">
            <p className="text-theme-primary text-sm font-medium pt-2">Add Pattern</p>
            
            {/* Quick add from presets */}
            <div className="space-y-2">
              <p className="text-theme-muted text-xs">Quick add from presets:</p>
              <div className="flex flex-wrap gap-1.5">
                {panelState.presetPatterns
                  .filter(p => !panelState.trackedPatterns.some(t => t.pattern === p.pattern))
                  .slice(0, 12)
                  .map((preset) => (
                    <button
                      key={preset.pattern}
                      onClick={() => handleAddPattern(preset.pattern)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs
                        bg-theme-secondary border border-theme-default text-theme-muted 
                        hover:border-theme-hover hover:text-theme-primary transition-colors"
                      title={preset.description}
                      disabled={panelState.isAddingPattern}
                    >
                      <Plus style={{ width: 10, height: 10 }} />
                      {preset.pattern}
                    </button>
                  ))}
              </div>
            </div>

            {/* Custom pattern input */}
            <div className="flex items-center gap-2">
              <Input
                placeholder="*.custom or path/to/files/*"
                value={panelState.customPattern}
                onChange={(e: ChangeEvent<HTMLInputElement>) => 
                  setPanelState(prev => ({ ...prev, customPattern: e.target.value }))
                }
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter') {
                    handleAddPattern(panelState.customPattern);
                  }
                }}
                className="flex-1 h-8 text-sm"
                disabled={panelState.isAddingPattern}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddPattern(panelState.customPattern)}
                disabled={!panelState.customPattern.trim() || panelState.isAddingPattern}
                loading={panelState.isAddingPattern}
              >
                <Plus style={iconStyleSm} />
                Add
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LFS auto-download task */}
      <BackgroundTaskCard
        taskType={BackgroundTaskType.TaskLFSFetch}
        taskKey="lfsFetchTask"
        label="Auto-download Large Files"
        description="Automatically download large files for recent work in the background"
        icon={HardDrive}
        defaultInterval={10}
        settings={settings}
        taskStatuses={taskStatuses}
        runningTask={runningTask}
        onToggle={handleTaskToggle}
        onIntervalChange={handleIntervalChange}
        onRunNow={handleRunNow}
      />

      {/* LFS download options */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock style={iconStyle} className="text-theme-muted" />
            <CardTitle>Download Settings</CardTitle>
          </div>
          <CardDescription>Configure which large files to download</CardDescription>
        </CardHeader>
        <CardContent>
          <IntervalInput
            label="Download files from last"
            value={lfsSettings.fetchRecentDays}
            onChange={(val: number) => handleLFSSettingsChange('fetchRecentDays', val)}
            unit="days"
            min={1}
            max={90}
          />
          <p className="text-theme-muted text-xs mt-1">
            Only download large files that were modified within this time period
          </p>
        </CardContent>
      </Card>

      {/* Storage management */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Trash2 style={iconStyle} className="text-theme-muted" />
            <CardTitle>Storage Management</CardTitle>
          </div>
          <CardDescription>Automatically clean up old large files to save disk space</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <SettingRow
            label="Auto-clean old files"
            description="Automatically remove large files you haven't used recently"
            checked={lfsSettings.autoPrune}
            onChange={(val: boolean) => handleLFSSettingsChange('autoPrune', val)}
          />
          <IntervalInput
            label="Keep files for at least"
            value={lfsSettings.pruneKeepDays}
            onChange={(val: number) => handleLFSSettingsChange('pruneKeepDays', val)}
            unit="days"
            min={7}
            max={365}
            disabled={!lfsSettings.autoPrune}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Branch Protection Panel
// ============================================================================
const BranchProtectionPanel = memo(function BranchProtectionPanel({ settings, onUpdate, repoPath }: PanelProps): JSX.Element {
  const [newBranch, setNewBranch] = useState<string>('');
  const protectedSettings: ProtectedBranchesSettings = settings.protectedBranches || { 
    protectedBranches: ['main', 'master'], 
    warnOnDirectCommit: true, 
    requireConfirmation: true 
  };

  const handleChange = async (key: keyof ProtectedBranchesSettings, value: string[] | boolean): Promise<void> => {
    try {
      await UpdateProtectedBranches(repoPath, {
        ...protectedSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Branch protection updated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  const handleAddBranch = async (): Promise<void> => {
    const branch = newBranch.trim();
    if (!branch) return;
    if (protectedSettings.protectedBranches.includes(branch)) {
      toast.error('Branch already protected');
      return;
    }
    
    await handleChange('protectedBranches', [...protectedSettings.protectedBranches, branch]);
    setNewBranch('');
  };

  const handleRemoveBranch = async (branch: string): Promise<void> => {
    await handleChange(
      'protectedBranches', 
      protectedSettings.protectedBranches.filter(b => b !== branch)
    );
  };

  return (
    <div className="space-y-4">
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield style={iconStyle} className="text-theme-muted" />
            <CardTitle>Protected Branches</CardTitle>
          </div>
          <CardDescription>
            These branches require extra confirmation before making changes directly to them.
            This helps prevent accidental commits to important branches like main or master.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {protectedSettings.protectedBranches.length > 0 ? (
              protectedSettings.protectedBranches.map(branch => (
                <Badge 
                  key={branch} 
                  variant="outline"
                  className="flex items-center gap-1 px-2 py-1"
                >
                  <Shield style={{ width: 12, height: 12 }} />
                  {branch}
                  <button
                    onClick={() => handleRemoveBranch(branch)}
                    className="ml-1 hover:text-red-400 transition-colors"
                  >
                    ×
                  </button>
                </Badge>
              ))
            ) : (
              <p className="text-theme-muted text-sm">No protected branches configured</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newBranch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewBranch(e.target.value)}
              placeholder="Add branch name (e.g., production, develop)..."
              className="flex-1 h-8"
              onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleAddBranch()}
            />
            <Button variant="outline" size="sm" onClick={handleAddBranch}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle style={iconStyle} className="text-theme-muted" />
            <CardTitle>Protection Behavior</CardTitle>
          </div>
          <CardDescription>What happens when you try to commit to a protected branch</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Show warning message"
            description="Display a warning banner when working on a protected branch"
            checked={protectedSettings.warnOnDirectCommit}
            onChange={(val: boolean) => handleChange('warnOnDirectCommit', val)}
          />
          <SettingRow
            label="Require confirmation"
            description="Ask for confirmation before saving changes to a protected branch"
            checked={protectedSettings.requireConfirmation}
            onChange={(val: boolean) => handleChange('requireConfirmation', val)}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Performance Panel
// Combines: Maintenance task + Maintenance settings
// ============================================================================
const PerformancePanel = memo(function PerformancePanel({ settings, onUpdate, repoPath }: PanelProps): JSX.Element {
  const [taskStatuses, setTaskStatuses] = useState<TaskStatuses>({});
  const [runningTask, setRunningTask] = useState<BackgroundTaskType | null>(null);

  const maintenanceSettings: MaintenanceSettings = settings.maintenanceSettings || { 
    commitGraph: true, 
    packRefs: false, 
    looseObjects: false 
  };

  const fetchStatuses = useCallback(async (): Promise<void> => {
    try {
      const statuses = await GetTaskStatuses();
      setTaskStatuses(statuses || {});
    } catch (err) {
      console.error('Failed to fetch task statuses:', err);
    }
  }, []);

  useEffect(() => {
    fetchStatuses();
    const interval = setInterval(fetchStatuses, 10000);
    return () => clearInterval(interval);
  }, [fetchStatuses]);

  const handleTaskToggle = async (taskType: BackgroundTaskType, enabled: boolean): Promise<void> => {
    try {
      const currentConfig = settings.maintenanceTask || { enabled: false, intervalMinutes: 30 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`Auto-optimization ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  const handleIntervalChange = async (taskType: BackgroundTaskType, intervalMinutes: number): Promise<void> => {
    try {
      const currentConfig = settings.maintenanceTask || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update interval: ${errorMessage}`);
    }
  };

  const handleRunNow = async (taskType: BackgroundTaskType): Promise<void> => {
    setRunningTask(taskType);
    try {
      const result = await RunTaskNow(repoPath, taskType);
      if (result.success) {
        toast.success('Optimization completed');
      } else {
        toast.error(result.error || 'Optimization failed');
      }
      fetchStatuses();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Optimization failed: ${errorMessage}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleMaintenanceSettingsChange = async (key: keyof MaintenanceSettings, value: boolean): Promise<void> => {
    try {
      await UpdateMaintenanceSettings(repoPath, {
        ...maintenanceSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Optimization settings updated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to update: ${errorMessage}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Auto-optimization task */}
      <BackgroundTaskCard
        taskType={BackgroundTaskType.TaskMaintenance}
        taskKey="maintenanceTask"
        label="Auto-optimize Repository"
        description="Periodically clean up and optimize the repository for better performance"
        icon={Zap}
        defaultInterval={30}
        settings={settings}
        taskStatuses={taskStatuses}
        runningTask={runningTask}
        onToggle={handleTaskToggle}
        onIntervalChange={handleIntervalChange}
        onRunNow={handleRunNow}
      />

      {/* Optimization tasks selection */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench style={iconStyle} className="text-theme-muted" />
            <CardTitle>Optimization Tasks</CardTitle>
          </div>
          <CardDescription>Choose which optimizations to run. More tasks = better performance but longer runtime.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingRow
            label="Update commit graph"
            description="Speed up history browsing and branch operations (recommended)"
            checked={maintenanceSettings.commitGraph}
            onChange={(val: boolean) => handleMaintenanceSettingsChange('commitGraph', val)}
          />
          <SettingRow
            label="Compress branch references"
            description="Pack refs for slightly faster operations (adds a few seconds)"
            checked={maintenanceSettings.packRefs}
            onChange={(val: boolean) => handleMaintenanceSettingsChange('packRefs', val)}
          />
          <SettingRow
            label="Repack loose objects"
            description="Deep cleanup for maximum space savings (can take longer)"
            checked={maintenanceSettings.looseObjects}
            onChange={(val: boolean) => handleMaintenanceSettingsChange('looseObjects', val)}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Detached HEAD Recovery Component
// ============================================================================
const DetachedHeadRecovery = memo(function DetachedHeadRecovery({ 
  repoPath, 
  onRecovered, 
  isFixing, 
  setIsFixing 
}: DetachedHeadRecoveryProps): JSX.Element {
  const [branchName, setBranchName] = useState<string>('');
  const [error, setError] = useState<string>('');

  const handleCreateBranch = async (): Promise<void> => {
    if (!branchName.trim()) {
      setError('Please enter a branch name');
      return;
    }
    
    // Basic branch name validation
    if (!/^[a-zA-Z0-9_/-]+$/.test(branchName)) {
      setError('Branch name can only contain letters, numbers, underscores, hyphens, and slashes');
      return;
    }

    setIsFixing(true);
    setError('');
    try {
      const result = await RecoverFromDetachedHead(repoPath, branchName, '');
      if (result.success) {
        toast.success(`Created and switched to branch: ${branchName}`);
        setBranchName('');
        onRecovered();
      } else {
        setError(result.error || 'Failed to create branch');
        toast.error(result.error || 'Failed to create branch');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(`Failed: ${errorMessage}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="bg-theme-surface border-blue-500/30">
      <CardHeader>
        <div className="flex items-center gap-2">
          <GitBranch style={iconStyle} className="text-blue-400" />
          <CardTitle className="text-blue-400">Not on Any Branch (Detached HEAD)</CardTitle>
        </div>
        <CardDescription>
          Your work isn't on a branch yet. Create a branch to save your changes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Enter new branch name (e.g., my-saved-work)"
            value={branchName}
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              setBranchName(e.target.value);
              setError('');
            }}
            className="flex-1"
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && handleCreateBranch()}
          />
          <Button
            onClick={handleCreateBranch}
            disabled={isFixing || !branchName.trim()}
            loading={isFixing}
          >
            <GitBranch style={iconStyleSm} className="mr-1" />
            Create Branch
          </Button>
        </div>
        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}
        <p className="text-theme-muted text-xs">
          This will create a new branch from your current position and switch to it, 
          preserving all your work.
        </p>
      </CardContent>
    </Card>
  );
});

// ============================================================================
// Troubleshooting Panel
// ============================================================================
const TroubleshootingPanel = memo(function TroubleshootingPanel({ repoPath }: TroubleshootingPanelProps): JSX.Element {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isFixing, setIsFixing] = useState<boolean>(false);

  const runDiagnostics = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await DiagnoseRepository(repoPath);
      setDiagnostics(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Diagnostics failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath) {
      runDiagnostics();
    }
  }, [repoPath, runDiagnostics]);

  const handleFix = async (
    action: (path: string) => Promise<{ success: boolean; error?: string }>, 
    label: string
  ): Promise<void> => {
    setIsFixing(true);
    try {
      const result = await action(repoPath);
      if (result.success) {
        toast.success(`${label} completed`);
        runDiagnostics();
      } else {
        toast.error(result.error || `${label} failed`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`${label} failed: ${errorMessage}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle style={iconStyle} className="text-theme-muted" />
              <CardTitle>Repository Health Check</CardTitle>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={runDiagnostics}
              loading={isLoading}
            >
              <RefreshCw style={iconStyleSm} />
              Check Again
            </Button>
          </div>
          <CardDescription>Scan for common issues that might cause problems</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-theme-muted text-sm">Checking repository...</p>
          ) : diagnostics ? (
            <div className="space-y-3">
              {diagnostics.issues && diagnostics.issues.length > 0 ? (
                <div className="space-y-2">
                  {diagnostics.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-red-500/10 rounded border border-red-500/30">
                      <AlertTriangle style={iconStyleSm} className="text-red-400 mt-0.5 shrink-0" />
                      <p className="text-red-400 text-sm">{issue}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded border border-green-500/30">
                  <Shield style={iconStyleSm} className="text-green-400" />
                  <p className="text-green-400 text-sm">Everything looks good! No issues detected.</p>
                </div>
              )}
              
              {diagnostics.suggestions && diagnostics.suggestions.length > 0 && (
                <div className="pt-2 border-t border-theme-default">
                  <p className="text-theme-muted text-xs mb-2">Suggestions:</p>
                  <ul className="space-y-1">
                    {diagnostics.suggestions.map((suggestion, i) => (
                      <li key={i} className="text-theme-secondary text-sm">• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <p className="text-theme-muted text-sm">Click "Check Again" to scan for issues</p>
          )}
        </CardContent>
      </Card>

      {/* Quick Fix Actions */}
      <Card className="bg-theme-surface">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Wrench style={iconStyle} className="text-theme-muted" />
            <CardTitle>Fix Common Problems</CardTitle>
          </div>
          <CardDescription>One-click fixes for common issues</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {diagnostics?.hasStaleLocks && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(RemoveStaleLocks, 'Remove stale locks')}
              disabled={isFixing}
            >
              <Trash2 style={iconStyleSm} className="mr-2" />
              Remove Stale Lock Files
              <span className="ml-auto text-theme-muted text-xs">Fixes "another git process" errors</span>
            </Button>
          )}
          {diagnostics?.hasMergeConflict && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortMerge, 'Abort merge')}
              disabled={isFixing}
            >
              <AlertTriangle style={iconStyleSm} className="mr-2" />
              Cancel Stuck Merge
              <span className="ml-auto text-theme-muted text-xs">Reverts to before the merge started</span>
            </Button>
          )}
          {diagnostics?.hasRebaseInProgress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortCurrentOperation, 'Abort rebase')}
              disabled={isFixing}
            >
              <AlertTriangle style={iconStyleSm} className="mr-2" />
              Cancel Stuck Rebase
              <span className="ml-auto text-theme-muted text-xs">Reverts to before the rebase started</span>
            </Button>
          )}
          {diagnostics?.hasCherryPickInProgress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortCherryPick, 'Abort cherry-pick')}
              disabled={isFixing}
            >
              <AlertTriangle style={iconStyleSm} className="mr-2" />
              Cancel Stuck Cherry-Pick
              <span className="ml-auto text-theme-muted text-xs">Reverts to before the cherry-pick</span>
            </Button>
          )}
          {diagnostics?.hasRevertInProgress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortRevert, 'Abort revert')}
              disabled={isFixing}
            >
              <RotateCcw style={iconStyleSm} className="mr-2" />
              Cancel Stuck Revert
              <span className="ml-auto text-theme-muted text-xs">Reverts to before the revert started</span>
            </Button>
          )}
          {diagnostics?.hasBisectInProgress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortBisect, 'End bisect')}
              disabled={isFixing}
            >
              <Search style={iconStyleSm} className="mr-2" />
              End Bug Search (Bisect)
              <span className="ml-auto text-theme-muted text-xs">Exits bisect session</span>
            </Button>
          )}
          {diagnostics?.hasAMInProgress && (
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => handleFix(AbortAM, 'Abort patch application')}
              disabled={isFixing}
            >
              <FileText style={iconStyleSm} className="mr-2" />
              Cancel Patch Application
              <span className="ml-auto text-theme-muted text-xs">Aborts git am operation</span>
            </Button>
          )}
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => handleFix(RepairRepository, 'Repository repair')}
            disabled={isFixing}
          >
            <Wrench style={iconStyleSm} className="mr-2" />
            Deep Clean & Repair
            <span className="ml-auto text-theme-muted text-xs">Full maintenance check</span>
          </Button>
        </CardContent>
      </Card>

      {/* Detached HEAD Recovery */}
      {diagnostics?.isDetachedHead && (
        <DetachedHeadRecovery 
          repoPath={repoPath} 
          onRecovered={runDiagnostics}
          isFixing={isFixing}
          setIsFixing={setIsFixing}
        />
      )}
    </div>
  );
});

// ============================================================================
// Main RepoSettingsPage Component
// ============================================================================
function RepoSettingsPage(): JSX.Element {
  const { selectedRepoSettingsCategory } = useLayout();
  const { repoPath, repoInfo } = useRepo();
  const [settings, setSettings] = useState<RepoSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const categoryInfo = REPO_SETTINGS_CATEGORIES.find(
    (c) => c.id === selectedRepoSettingsCategory
  ) || REPO_SETTINGS_CATEGORIES[0];

  const loadSettings = useCallback(async (): Promise<void> => {
    if (!repoPath) return;
    
    setIsLoading(true);
    try {
      const result = await GetSettings(repoPath);
      setSettings(result as unknown as RepoSettings);
    } catch (err) {
      console.error('Failed to load repo settings:', err);
      toast.error('Failed to load repository settings');
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleResetToDefaults = async (): Promise<void> => {
    if (!repoPath) return;
    
    try {
      const result = await ResetToDefaults(repoPath);
      if (result.success) {
        toast.success('Settings reset to defaults');
        loadSettings();
      } else {
        toast.error(result.error || 'Failed to reset settings');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      toast.error(`Failed to reset: ${errorMessage}`);
    }
  };

  const renderCategoryContent = (): JSX.Element => {
    if (!repoPath || !repoInfo?.isRepo) {
      return (
        <div className="text-center py-12">
          <Settings style={{ width: 48, height: 48 }} className="text-theme-muted mx-auto mb-4" />
          <p className="text-theme-muted">Open a repository to configure settings</p>
        </div>
      );
    }

    if (isLoading || !settings) {
      return (
        <div className="text-center py-12">
          <RefreshCw style={{ width: 24, height: 24 }} className="text-theme-muted mx-auto mb-4 animate-spin" />
          <p className="text-theme-muted">Loading settings...</p>
        </div>
      );
    }

    switch (selectedRepoSettingsCategory) {
      case 'remote-sync':
        return <RemoteSyncPanel settings={settings} onUpdate={loadSettings} repoPath={repoPath} />;
      case 'large-files':
        return <LargeFilesPanel settings={settings} onUpdate={loadSettings} repoPath={repoPath} />;
      case 'branch-protection':
        return <BranchProtectionPanel settings={settings} onUpdate={loadSettings} repoPath={repoPath} />;
      case 'performance':
        return <PerformancePanel settings={settings} onUpdate={loadSettings} repoPath={repoPath} />;
      case 'troubleshooting':
        return <TroubleshootingPanel repoPath={repoPath} />;
      default:
        return <></>;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Settings style={{ width: 24, height: 24 }} className="text-theme-muted" />
              <h2 className="text-xl text-theme-primary font-medium">{categoryInfo.name}</h2>
            </div>
            {repoPath && repoInfo?.isRepo && selectedRepoSettingsCategory !== 'troubleshooting' && (
              <Button variant="ghost" size="sm" onClick={handleResetToDefaults}>
                Reset to Defaults
              </Button>
            )}
          </div>
          <p className="text-theme-muted">{categoryInfo.description}</p>
          {repoPath && (
            <p className="text-theme-muted text-xs mt-1">
              Repository: {repoPath.split('/').pop()}
            </p>
          )}
        </div>
        
        {/* Category content */}
        {renderCategoryContent()}
      </div>
    </div>
  );
}

export default memo(RepoSettingsPage);
