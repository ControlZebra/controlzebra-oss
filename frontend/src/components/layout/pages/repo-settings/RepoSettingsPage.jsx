/**
 * RepoSettingsPage - Main area content for Repository Settings view.
 * Shows repository-specific settings forms organized by user perspective.
 */
import { memo, useState, useEffect, useCallback } from 'react';
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
  SaveSettings,
  UpdateBackgroundTask,
  UpdateFetchSettings,
  UpdateLFSSettings,
  UpdateMaintenanceSettings,
  UpdateProtectedBranches,
  StartBackgroundTasks,
  StopBackgroundTasks,
  RunTaskNow,
  GetTaskStatuses,
  DiagnoseRepository,
  RemoveStaleLocks,
  AbortMerge,
  AbortRebase,
  AbortCherryPick,
  RepairRepository,
  ResetToDefaults,
  RecoverFromDetachedHead,
} from '../../../../../bindings/changeme/services/repositorysettingsservice';
import {
  AbortRevert,
  AbortBisect,
  AbortAM,
} from '../../../../../bindings/changeme/services/gitservice';
import { BackgroundTaskType } from '../../../../../bindings/changeme/services/models';

const iconStyle = { width: ICON_SIZES.md, height: ICON_SIZES.md };
const iconStyleSm = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

// ============================================================================
// Setting Row Component - Reusable row with switch toggle
// ============================================================================
const SettingRow = memo(function SettingRow({ 
  label, 
  description, 
  checked, 
  onChange, 
  disabled = false 
}) {
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
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <Label className="text-theme-primary text-sm min-w-32">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value) || min)))}
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
}) {
  const config = settings[taskKey] || { enabled: false, intervalMinutes: defaultInterval };
  const status = taskStatuses[taskType];

  return (
    <Card className="bg-theme-base">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon style={iconStyleSm} className="text-theme-muted" />
            <CardTitle className="text-sm">{label}</CardTitle>
            {status?.isRunning && (
              <Badge variant="secondary" className="text-xs">Running</Badge>
            )}
          </div>
          <Switch 
            checked={config.enabled}
            onCheckedChange={(enabled) => onToggle(taskType, enabled)}
          />
        </div>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between gap-4">
          <IntervalInput
            label="Run every"
            value={config.intervalMinutes}
            onChange={(val) => onIntervalChange(taskType, val)}
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
const RemoteSyncPanel = memo(function RemoteSyncPanel({ settings, onUpdate, repoPath }) {
  const [taskStatuses, setTaskStatuses] = useState({});
  const [runningTask, setRunningTask] = useState(null);

  const fetchSettings = settings.fetchSettings || { 
    fetchAllRemotes: true, 
    pruneStaleBranches: true, 
    fetchTags: true 
  };

  const fetchStatuses = useCallback(async () => {
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

  const handleTaskToggle = async (taskType, enabled) => {
    try {
      const taskKey = 'fetchTask';
      const currentConfig = settings[taskKey] || { enabled: false, intervalMinutes: 5 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`Auto-sync ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const handleIntervalChange = async (taskType, intervalMinutes) => {
    try {
      const taskKey = 'fetchTask';
      const currentConfig = settings[taskKey] || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      toast.error(`Failed to update interval: ${err.message}`);
    }
  };

  const handleRunNow = async (taskType) => {
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
      toast.error(`Sync failed: ${err.message}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleFetchSettingsChange = async (key, value) => {
    try {
      await UpdateFetchSettings(repoPath, {
        ...fetchSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Sync settings updated');
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
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
      <Card className="bg-theme-base">
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
            onChange={(val) => handleFetchSettingsChange('fetchAllRemotes', val)}
          />
          <SettingRow
            label="Clean up deleted branches"
            description="Remove local references to branches deleted on remote"
            checked={fetchSettings.pruneStaleBranches}
            onChange={(val) => handleFetchSettingsChange('pruneStaleBranches', val)}
          />
          <SettingRow
            label="Sync tags"
            description="Download all tags from remote"
            checked={fetchSettings.fetchTags}
            onChange={(val) => handleFetchSettingsChange('fetchTags', val)}
          />
        </CardContent>
      </Card>
    </div>
  );
});

// ============================================================================
// Large Files (LFS) Panel
// Combines: LFS settings + LFS background fetch task
// ============================================================================
const LargeFilesPanel = memo(function LargeFilesPanel({ settings, onUpdate, repoPath }) {
  const [taskStatuses, setTaskStatuses] = useState({});
  const [runningTask, setRunningTask] = useState(null);

  const lfsSettings = settings.lfsSettings || { 
    autoFetch: true, 
    fetchRecentDays: 7, 
    autoPrune: false, 
    pruneKeepDays: 30 
  };

  const fetchStatuses = useCallback(async () => {
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

  const handleTaskToggle = async (taskType, enabled) => {
    try {
      const currentConfig = settings.lfsFetchTask || { enabled: false, intervalMinutes: 10 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`LFS auto-download ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const handleIntervalChange = async (taskType, intervalMinutes) => {
    try {
      const currentConfig = settings.lfsFetchTask || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      toast.error(`Failed to update interval: ${err.message}`);
    }
  };

  const handleRunNow = async (taskType) => {
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
      toast.error(`LFS download failed: ${err.message}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleLFSSettingsChange = async (key, value) => {
    try {
      await UpdateLFSSettings(repoPath, {
        ...lfsSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('LFS settings updated');
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  return (
    <div className="space-y-4">
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
      <Card className="bg-theme-base">
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
            onChange={(val) => handleLFSSettingsChange('fetchRecentDays', val)}
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
      <Card className="bg-theme-base">
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
            onChange={(val) => handleLFSSettingsChange('autoPrune', val)}
          />
          <IntervalInput
            label="Keep files for at least"
            value={lfsSettings.pruneKeepDays}
            onChange={(val) => handleLFSSettingsChange('pruneKeepDays', val)}
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
const BranchProtectionPanel = memo(function BranchProtectionPanel({ settings, onUpdate, repoPath }) {
  const [newBranch, setNewBranch] = useState('');
  const protectedSettings = settings.protectedBranches || { 
    protectedBranches: ['main', 'master'], 
    warnOnDirectCommit: true, 
    requireConfirmation: true 
  };

  const handleChange = async (key, value) => {
    try {
      await UpdateProtectedBranches(repoPath, {
        ...protectedSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Branch protection updated');
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const handleAddBranch = async () => {
    const branch = newBranch.trim();
    if (!branch) return;
    if (protectedSettings.protectedBranches.includes(branch)) {
      toast.error('Branch already protected');
      return;
    }
    
    await handleChange('protectedBranches', [...protectedSettings.protectedBranches, branch]);
    setNewBranch('');
  };

  const handleRemoveBranch = async (branch) => {
    await handleChange(
      'protectedBranches', 
      protectedSettings.protectedBranches.filter(b => b !== branch)
    );
  };

  return (
    <div className="space-y-4">
      <Card className="bg-theme-base">
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
                  variant="secondary"
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
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder="Add branch name (e.g., production, develop)..."
              className="flex-1 h-8"
              onKeyDown={(e) => e.key === 'Enter' && handleAddBranch()}
            />
            <Button variant="outline" size="sm" onClick={handleAddBranch}>
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-theme-base">
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
            onChange={(val) => handleChange('warnOnDirectCommit', val)}
          />
          <SettingRow
            label="Require confirmation"
            description="Ask for confirmation before saving changes to a protected branch"
            checked={protectedSettings.requireConfirmation}
            onChange={(val) => handleChange('requireConfirmation', val)}
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
const PerformancePanel = memo(function PerformancePanel({ settings, onUpdate, repoPath }) {
  const [taskStatuses, setTaskStatuses] = useState({});
  const [runningTask, setRunningTask] = useState(null);

  const maintenanceSettings = settings.maintenanceSettings || { 
    commitGraph: true, 
    packRefs: false, 
    looseObjects: false 
  };

  const fetchStatuses = useCallback(async () => {
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

  const handleTaskToggle = async (taskType, enabled) => {
    try {
      const currentConfig = settings.maintenanceTask || { enabled: false, intervalMinutes: 30 };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        enabled,
      });
      onUpdate();
      toast.success(`Auto-optimization ${enabled ? 'enabled' : 'disabled'}`);
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
    }
  };

  const handleIntervalChange = async (taskType, intervalMinutes) => {
    try {
      const currentConfig = settings.maintenanceTask || { enabled: true, intervalMinutes };
      await UpdateBackgroundTask(repoPath, taskType, {
        ...currentConfig,
        intervalMinutes,
      });
      onUpdate();
    } catch (err) {
      toast.error(`Failed to update interval: ${err.message}`);
    }
  };

  const handleRunNow = async (taskType) => {
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
      toast.error(`Optimization failed: ${err.message}`);
    } finally {
      setRunningTask(null);
    }
  };

  const handleMaintenanceSettingsChange = async (key, value) => {
    try {
      await UpdateMaintenanceSettings(repoPath, {
        ...maintenanceSettings,
        [key]: value,
      });
      onUpdate();
      toast.success('Optimization settings updated');
    } catch (err) {
      toast.error(`Failed to update: ${err.message}`);
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
      <Card className="bg-theme-base">
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
            onChange={(val) => handleMaintenanceSettingsChange('commitGraph', val)}
          />
          <SettingRow
            label="Compress branch references"
            description="Pack refs for slightly faster operations (adds a few seconds)"
            checked={maintenanceSettings.packRefs}
            onChange={(val) => handleMaintenanceSettingsChange('packRefs', val)}
          />
          <SettingRow
            label="Repack loose objects"
            description="Deep cleanup for maximum space savings (can take longer)"
            checked={maintenanceSettings.looseObjects}
            onChange={(val) => handleMaintenanceSettingsChange('looseObjects', val)}
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
}) {
  const [branchName, setBranchName] = useState('');
  const [error, setError] = useState('');

  const handleCreateBranch = async () => {
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
      setError(err.message);
      toast.error(`Failed: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <Card className="bg-theme-base border-blue-500/30">
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
            onChange={(e) => {
              setBranchName(e.target.value);
              setError('');
            }}
            className="flex-1"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateBranch()}
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
const TroubleshootingPanel = memo(function TroubleshootingPanel({ repoPath }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFixing, setIsFixing] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await DiagnoseRepository(repoPath);
      setDiagnostics(result);
    } catch (err) {
      toast.error(`Diagnostics failed: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => {
    if (repoPath) {
      runDiagnostics();
    }
  }, [repoPath, runDiagnostics]);

  const handleFix = async (action, label) => {
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
      toast.error(`${label} failed: ${err.message}`);
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="bg-theme-base">
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
              {diagnostics.issues?.length > 0 ? (
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
              
              {diagnostics.suggestions?.length > 0 && (
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
      <Card className="bg-theme-base">
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
              onClick={() => handleFix(AbortRebase, 'Abort rebase')}
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
function RepoSettingsPage() {
  const { selectedRepoSettingsCategory } = useLayout();
  const { repoPath, repoInfo } = useRepo();
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const categoryInfo = REPO_SETTINGS_CATEGORIES.find(c => c.id === selectedRepoSettingsCategory) 
    || REPO_SETTINGS_CATEGORIES[0];

  const loadSettings = useCallback(async () => {
    if (!repoPath) return;
    
    setIsLoading(true);
    try {
      const result = await GetSettings(repoPath);
      setSettings(result);
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

  const handleResetToDefaults = async () => {
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
      toast.error(`Failed to reset: ${err.message}`);
    }
  };

  const renderCategoryContent = () => {
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
        return null;
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
