/**
 * GeneralSettings - App preferences including theme selection and analytics consent.
 */
import { memo, useCallback, useEffect, useState, type CSSProperties, type JSX } from 'react';
import { BarChart3, FolderTree, Info, LogOut, Palette } from 'lucide-react';
import { useLayout, useAuth, type Theme } from '../../../context';
import { ICON_SIZES } from '../../../shared/constants';
import { 
  getAnalyticsConsent, 
  setAnalyticsConsent, 
  type AnalyticsConsent 
} from '../../../domain/analytics/analytics';
import {
  Button,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/ui';
import {
  GetDataLocations,
} from '../../../../bindings/controlzebra/services/settingsservice';
import type { DataLocations } from '../../../../bindings/controlzebra/services/models';

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
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsent>(getAnalyticsConsent);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dataLocations, setDataLocations] = useState<DataLocations | null>(null);

  const handleThemeChange = useCallback((value: string) => {
    setTheme(value as Theme);
  }, [setTheme]);

  const handleAnalyticsChange = useCallback((value: string) => {
    const level = value as AnalyticsConsent;
    setAnalyticsConsent(level);
    setAnalyticsConsentState(level);
  }, []);

  useEffect(() => {
    GetDataLocations()
      .then((locations) => {
        setDataLocations(locations);
      })
      .catch(() => {
        // Non-fatal diagnostics panel fallback
      });
  }, []);

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
          <p className="text-theme-secondary">
            <span className="text-theme-muted">Update channel:</span>{' '}
            <span className="text-theme-primary">Disabled in beta builds</span>
          </p>
        </div>
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
