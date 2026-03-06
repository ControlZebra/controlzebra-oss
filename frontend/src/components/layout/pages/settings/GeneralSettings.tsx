/**
 * GeneralSettings - App preferences including theme selection and analytics consent.
 */
import { memo, useEffect, useState, type CSSProperties, type JSX } from 'react';
import { Sun, Moon, Monitor, BarChart3, LogOut, Info, FolderTree, type LucideIcon } from 'lucide-react';
import { useLayout, useAuth, type Theme } from '../../../../context';
import { ICON_SIZES } from '../../../../constants';
import { 
  getAnalyticsConsent, 
  setAnalyticsConsent, 
  type AnalyticsConsent 
} from '../../../../domain/analytics/analytics';
import { Button } from '../../../ui';
import {
  GetDataLocations,
} from '../../../../../bindings/controlzebra/services/settingsservice';
import type { DataLocations } from '../../../../../bindings/controlzebra/services/models';

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
  Icon: LucideIcon;
}

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'light', label: 'Light', Icon: Sun },
  { id: 'dark', label: 'Dark', Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
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

function GeneralSettings(): JSX.Element {
  const { theme, setTheme } = useLayout();
  const { isAuthenticated, userEmail, logout } = useAuth();
  const [analyticsConsent, setAnalyticsConsentState] = useState<AnalyticsConsent>(getAnalyticsConsent);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [dataLocations, setDataLocations] = useState<DataLocations | null>(null);

  // Handle analytics consent change
  const handleAnalyticsChange = (level: AnalyticsConsent) => {
    setAnalyticsConsent(level);
    setAnalyticsConsentState(level);
  };

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
    { label: 'Roaming config', path: dataLocations?.roamingConfigDir },
    { label: 'Repository settings', path: dataLocations?.repositorySettingsDir },
    { label: 'Settings file', path: dataLocations?.settingsFile },
    { label: 'Local logs', path: dataLocations?.logsDir },
    { label: 'Local cache', path: dataLocations?.cacheDir },
    { label: 'Portable tools bin', path: dataLocations?.toolsBinDir },
    { label: 'WebView2 data', path: dataLocations?.webView2Dir },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        {/* Theme Selection */}
        <div className="mb-6">
          <label className="block text-theme-primary text-sm font-medium mb-3">
            Appearance
          </label>
          <p className="text-theme-muted text-sm mb-4">
            Choose how ControlZebra looks on your device.
          </p>

          <div className="flex gap-3">
            {THEME_OPTIONS.map(({ id, label, Icon }) => {
              const isSelected = theme === id;
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className={`
                    flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all min-w-[100px]
                    ${isSelected
                      ? 'border-blue-500 bg-blue-500/10 text-blue-500 dark:text-blue-400'
                      : 'border-theme-default bg-theme-surface hover:border-theme-muted text-theme-secondary hover:text-theme-primary'
                    }
                  `}
                >
                  <Icon style={iconStyle} />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Analytics Consent */}
        <div className="border-t border-theme-default pt-6">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 style={iconStyle} className="text-theme-secondary" />
            <label className="block text-theme-primary text-sm font-medium">
              Privacy & Analytics
            </label>
          </div>
          <p className="text-theme-muted text-sm mb-4">
            Help improve ControlZebra by sharing anonymous usage data.
          </p>

          <div className="flex flex-col gap-2">
            {ANALYTICS_OPTIONS.map(({ id, label, description }) => {
              const isSelected = analyticsConsent === id;
              return (
                <button
                  key={id}
                  onClick={() => handleAnalyticsChange(id)}
                  className={`
                    flex items-start gap-3 p-3 rounded-lg border-2 transition-all text-left
                    ${isSelected
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-theme-default bg-theme-surface hover:border-theme-muted'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center flex-shrink-0
                    ${isSelected ? 'border-blue-500 bg-blue-500' : 'border-theme-muted'}
                  `}>
                    {isSelected && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <span className={`text-sm font-medium block ${isSelected ? 'text-blue-500 dark:text-blue-400' : 'text-theme-primary'}`}>
                      {label}
                    </span>
                    <span className="text-theme-muted text-xs">
                      {description}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-theme-muted text-xs mt-3">
            No personal information or file contents are ever collected.
          </p>
        </div>

        {/* Account */}
        <div className="border-t border-theme-default pt-6 mt-6">
          <div className="flex items-center gap-2 mb-3">
            <LogOut style={iconStyle} className="text-theme-secondary" />
            <label className="block text-theme-primary text-sm font-medium">
              ControlZebra Account
            </label>
          </div>
          <p className="text-theme-muted text-sm mb-4">
            {isAuthenticated
              ? `Signed in as ${userEmail || 'your account'}.`
              : 'Sign in required to use the app.'}
          </p>

          <Button
            variant="secondary"
            size="sm"
            disabled={!isAuthenticated}
            loading={isSigningOut}
            onClick={async () => {
              if (!isAuthenticated) return;
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
        </div>
      </div>

      {/* Updates */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-2 mb-3">
          <Info style={iconStyle} className="text-theme-secondary" />
          <label className="block text-theme-primary text-sm font-medium">
            App Updates
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
            Data Locations
          </label>
        </div>
        <p className="text-theme-muted text-sm mb-4">
          Active storage paths used by ControlZebra on this machine.
        </p>

        <div className="space-y-2 text-sm">
          {DATA_LOCATION_ITEMS.map(({ label, path }) => (
            <div key={label} className="grid grid-cols-[180px_1fr] gap-2 items-start">
              <span className="text-theme-muted">{label}:</span>
              <span className="text-theme-primary break-all">{path || 'Unavailable'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(GeneralSettings);
