/**
 * GeneralSettings - App preferences including theme selection and analytics consent.
 */
import { memo, useCallback, useEffect, useState, type CSSProperties, type JSX } from 'react';
import { ArrowDownToLine, BarChart3, CheckCircle2, Download, FolderTree, Info, LogOut, Palette, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useAppUpdate, useLayout, useAuth, type Theme } from '../../../context';
import { ICON_SIZES } from '../../../shared/constants';
import { 
  getAnalyticsConsent, 
  setAnalyticsConsent, 
  type AnalyticsConsent 
} from '../../../domain/analytics/analytics';
import {
  Badge,
  Button,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui';
import {
  GetAppSettings,
  GetDataLocations,
  SaveAppSettings,
} from '../../../../bindings/controlzebra/services/settingsservice';
import type { AppSettings, DataLocations } from '../../../../bindings/controlzebra/services/models';

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '0.0.0-dev';

function formatDisplayVersion(version: string | undefined): string {
  const value = (version ?? '').trim();
  if (!value) return 'unknown';
  return value.toLowerCase().startsWith('v') ? value : `v${value}`;
}

interface ThemeOption {
  id: Theme;
  label: string;
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

interface AnalyticsOption {
  id: AnalyticsConsent;
  label: string;
  description: string;
}

const ANALYTICS_OPTIONS: AnalyticsOption[] = [
  { 
    id: 'minimal', 
    label: 'Minimal', 
    description: 'Only track errors to help fix bugs' 
  },
  { 
    id: 'standard', 
    label: 'Standard', 
    description: 'Track usage patterns to improve features' 
  },
  { 
    id: 'full', 
    label: 'Full', 
    description: 'Includes session replay for UX research' 
  },
];

const THEME_SELECT_OPTIONS = THEME_OPTIONS.map(({ id, label }) => ({
  value: id,
  label,
}));

const ANALYTICS_SELECT_OPTIONS = ANALYTICS_OPTIONS.map(({ id, label }) => ({
  value: id,
  label,
}));

function GeneralSettings(): JSX.Element {
  const { theme, setTheme, openAccountDialog } = useLayout();
  const { isAuthenticated, isAuthAvailable, userEmail, logout } = useAuth();
  const {
    checkForUpdates,
    errorMessage: updateErrorMessage,
    isBusy: isUpdateBusy,
    isUpdateAvailable,
    lastCheckedAt,
    latestResult,
    progress: updateProgress,
    readyToInstall,
    startUpdate,
    status: updateStatus,
  } = useAppUpdate();
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsent>(getAnalyticsConsent);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dataLocations, setDataLocations] = useState<DataLocations | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
  const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);

  const handleThemeChange = useCallback((value: string) => {
    setTheme(value as Theme);
  }, [setTheme]);

  const handleAnalyticsChange = useCallback((value: string) => {
    const level = value as AnalyticsConsent;
    setAnalyticsConsent(level);
    setAnalyticsConsentState(level);
  }, []);

  useEffect(() => {
    GetAppSettings()
      .then((settings) => {
        setAppSettings(settings);
        setAppSettingsLoaded(true);
      })
      .catch(() => {
        // Non-fatal settings fallback
      });

    GetDataLocations()
      .then((locations) => {
        setDataLocations(locations);
      })
      .catch(() => {
        // Non-fatal diagnostics panel fallback
      });
  }, []);

  const handleAutoDownloadChange = useCallback((checked: boolean) => {
    if (!appSettings) {
      return;
    }

    const previousSettings = appSettings;

    setAppSettings((currentSettings) => currentSettings
      ? {
        ...currentSettings,
        autoDownloadUpdates: checked,
      }
      : currentSettings);

    void GetAppSettings()
      .then((currentSettings) => {
        const nextSettings: AppSettings = {
          ...currentSettings,
          autoDownloadUpdates: checked,
        };

        return SaveAppSettings(nextSettings).then(() => {
          setAppSettings(nextSettings);
        });
      })
      .catch(() => {
        setAppSettings(previousSettings);
        toast.error('Could not save update settings.');
      });
  }, [appSettings]);

  const handleCheckForUpdates = useCallback(() => {
    void checkForUpdates();
  }, [checkForUpdates]);

  const handleStartUpdate = useCallback(() => {
    void startUpdate();
  }, [startUpdate]);

  const updateBadgeVariant = readyToInstall
    ? 'success'
    : updateStatus === 'error'
      ? 'error'
      : updateStatus === 'downloading' || updateStatus === 'checking' || updateStatus === 'installing'
        ? 'info'
        : isUpdateAvailable
          ? 'warning'
          : 'outline';
  const updateBadgeLabel = readyToInstall
    ? 'Ready to install'
    : updateStatus === 'checking'
      ? 'Checking'
      : updateStatus === 'downloading'
        ? 'Downloading'
        : updateStatus === 'installing'
          ? 'Installing'
          : updateStatus === 'error'
            ? 'Check failed'
            : isUpdateAvailable
              ? 'Update available'
              : lastCheckedAt
                ? 'Up to date'
                : 'Not checked yet';
  const updatePrimaryActionLabel = readyToInstall ? 'Install update' : 'Download and install';
  const updateVersionLabel = latestResult?.version ? formatDisplayVersion(latestResult.version) : null;
  const updateProgressPercent = typeof updateProgress?.percent === 'number' ? Math.max(0, Math.min(100, updateProgress.percent)) : null;
  const lastCheckedLabel = lastCheckedAt ? new Date(lastCheckedAt).toLocaleString() : null;

  const DATA_LOCATION_ITEMS: Array<{ label: string; path: string | undefined }> = [
    { label: 'Config', path: dataLocations?.roamingConfigDir },
    { label: 'Repo settings', path: dataLocations?.repositorySettingsDir },
    { label: 'Settings file', path: dataLocations?.settingsFile },
    { label: 'Logs', path: dataLocations?.logsDir },
    { label: 'Cache', path: dataLocations?.cacheDir },
    { label: 'Tools', path: dataLocations?.toolsBinDir },
    { label: 'WebView2', path: dataLocations?.webView2Dir },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Palette style={iconStyle} className="text-theme-secondary" />
                <label className="block text-theme-primary text-sm font-medium">
                  Theme
                </label>
              </div>
              <p className="text-theme-muted text-sm">
                Choose the app look.
              </p>
            </div>
            <Select
              value={theme}
              onValueChange={handleThemeChange}
              options={THEME_SELECT_OPTIONS}
              placeholder="Select theme"
              className="lg:mt-0"
            />
          </div>

          <div className="border-t border-theme-default" />

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px] lg:items-start">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BarChart3 style={iconStyle} className="text-theme-secondary" />
                <label className="block text-theme-primary text-sm font-medium">
                  Analytics
                </label>
              </div>
              <p className="text-theme-muted text-sm">
                Choose what anonymous app data can be shared.
              </p>
              <p className="text-theme-muted text-xs mt-2">
                No personal information or file contents are ever collected.
              </p>
            </div>
            <div className="space-y-2">
              <Select
                value={analyticsConsent}
                onValueChange={handleAnalyticsChange}
                options={ANALYTICS_SELECT_OPTIONS}
                placeholder="Select analytics"
              />
              <p className="text-theme-muted text-xs">
                {ANALYTICS_OPTIONS.find(({ id }) => id === analyticsConsent)?.description}
              </p>
            </div>
          </div>
        </div>

        {/* Account */}
        <div className="border-t border-theme-default pt-6 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <LogOut style={iconStyle} className="text-theme-secondary" />
            <label className="block text-theme-primary text-sm font-medium">
              Account
            </label>
          </div>
          <p className="text-theme-muted text-sm mb-4">
            {isAuthenticated
              ? `Signed in as ${userEmail || 'your account'}. ControlZebra account features are optional, and local Git work stays available if you sign out.`
              : isAuthAvailable
                ? 'A ControlZebra account is optional. You can keep using local Git workflows as a guest and sign in later from the account menu if you need cloud features.'
                : 'Account sign-in is unavailable in this build. Local Git workflows remain fully available.'}
          </p>

          <div className="flex flex-wrap gap-2">
            {isAuthenticated ? (
              <Button
                variant="secondary"
                size="sm"
                loading={isSigningOut}
                onClick={async () => {
                  setIsSigningOut(true);
                  try {
                    await logout();
                  } finally {
                    setIsSigningOut(false);
                  }
                }}
              >
                <LogOut style={iconStyle} />
                <span className="ml-1.5">Sign out</span>
              </Button>
            ) : isAuthAvailable ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={openAccountDialog}
              >
                <span>Sign in</span>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Updates */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-2 mb-3">
          <Info style={iconStyle} className="text-theme-secondary" />
          <label className="block text-theme-primary text-sm font-medium">
            Updates
          </label>
        </div>
        <div className="space-y-2 mb-4 text-sm">
          <p className="text-theme-secondary">
            <span className="text-theme-muted">Current app version:</span>{' '}
            <span className="text-theme-primary font-medium">{formatDisplayVersion(APP_VERSION)}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-theme-muted">Status:</span>
            <Badge variant={updateBadgeVariant}>{updateBadgeLabel}</Badge>
            {updateVersionLabel && isUpdateAvailable ? (
              <span className="text-theme-secondary">{updateVersionLabel} is available</span>
            ) : null}
          </div>
          {lastCheckedLabel ? (
            <p className="text-theme-muted text-xs">Last checked: {lastCheckedLabel}</p>
          ) : null}
          {updateProgress?.message ? (
            <p className="text-theme-secondary text-sm">
              {updateProgress.message}
              {updateProgressPercent !== null && (updateStatus === 'downloading' || updateStatus === 'installing') ? ` (${updateProgressPercent}%)` : ''}
            </p>
          ) : null}
          {updateErrorMessage ? (
            <p className="text-red-400 text-sm">{updateErrorMessage}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-theme-default pt-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckForUpdates}
            loading={updateStatus === 'checking' && isUpdateBusy}
          >
            <RefreshCw style={iconStyle} />
            <span>Check now</span>
          </Button>
          {isUpdateAvailable ? (
            <Button
              size="sm"
              onClick={handleStartUpdate}
              loading={isUpdateBusy && updateStatus !== 'checking'}
            >
              {readyToInstall ? <ArrowDownToLine style={iconStyle} /> : <Download style={iconStyle} />}
              <span>{updatePrimaryActionLabel}</span>
            </Button>
          ) : null}
        </div>

        <div className="border-t border-theme-default pt-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
            <div>
              <p className="text-theme-primary text-sm font-medium">Download updates automatically</p>
              <p className="text-theme-muted text-sm mt-1">
                When an update is available, ControlZebra can download it while the app is open. When the download is ready, you install it from here or from the top bar.
              </p>
            </div>
            <div className="pt-1">
              <Switch
                checked={appSettings?.autoDownloadUpdates ?? true}
                disabled={!appSettingsLoaded}
                onCheckedChange={handleAutoDownloadChange}
                aria-label="Download updates automatically"
              />
            </div>
          </div>
        </div>

        {readyToInstall ? (
          <div className="mt-4 rounded-md border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-300">
            <div className="flex items-start gap-2">
              <CheckCircle2 style={iconStyle} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-200">Update package downloaded</p>
                <p className="mt-1 text-green-300/90">
                  {updateVersionLabel ? `${updateVersionLabel} is ready to install.` : 'The latest update is ready to install.'}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Data Paths */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-2 mb-3">
          <FolderTree style={iconStyle} className="text-theme-secondary" />
          <label className="block text-theme-primary text-sm font-medium">
            Data
          </label>
        </div>
        <p className="text-theme-muted text-sm mb-4">
          Active storage paths used by ControlZebra on this machine.
        </p>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Location</TableHead>
              <TableHead>Path</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DATA_LOCATION_ITEMS.map(({ label, path }) => (
              <TableRow key={label}>
                <TableCell className="text-theme-secondary">{label}</TableCell>
                <TableCell className="text-sm break-all">
                  {path || <span className="text-theme-muted">Unavailable</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default memo(GeneralSettings);
