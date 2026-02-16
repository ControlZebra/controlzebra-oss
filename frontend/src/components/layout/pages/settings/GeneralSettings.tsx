/**
 * GeneralSettings - App preferences including theme selection and analytics consent.
 */
import { memo, useEffect, useState, type CSSProperties, type JSX } from 'react';
import { Sun, Moon, Monitor, BarChart3, LogOut, RefreshCw, Info, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useLayout, useAuth, type Theme } from '../../../../context';
import { ICON_SIZES } from '../../../../constants';
import { 
  getAnalyticsConsent, 
  setAnalyticsConsent, 
  type AnalyticsConsent 
} from '../../../../lib/analytics';
import { Button } from '../../../ui';
import {
  CheckForUpdate,
  GetCurrentVersion,
} from '../../../../../bindings/controlzebra/services/updaterservice';

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };
const LAST_UPDATE_CHECKED_KEY = 'cz_last_update_checked_at';

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
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('0.0.0-dev');
  const [lastCheckedAt, setLastCheckedAt] = useState<string>(() => (
    localStorage.getItem(LAST_UPDATE_CHECKED_KEY) || ''
  ));

  // Handle analytics consent change
  const handleAnalyticsChange = (level: AnalyticsConsent) => {
    setAnalyticsConsent(level);
    setAnalyticsConsentState(level);
  };

  // Load current app version from backend
  useEffect(() => {
    GetCurrentVersion()
      .then((version) => {
        setCurrentVersion(version || '0.0.0-dev');
      })
      .catch(() => {
        // Non-fatal; keep fallback value
      });
  }, []);

  const formatLastChecked = (iso: string): string => {
    if (!iso) return 'Never';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Never';
    return date.toLocaleString();
  };

  const handleCheckForUpdates = async (): Promise<void> => {
    if (isCheckingUpdates) return;

    setIsCheckingUpdates(true);
    try {
      const updateInfo = await CheckForUpdate();
      const checkedAt = new Date().toISOString();
      setLastCheckedAt(checkedAt);
      localStorage.setItem(LAST_UPDATE_CHECKED_KEY, checkedAt);

      if (updateInfo) {
        toast.info(`Update available: ${formatDisplayVersion(updateInfo.version)}`, {
          description: 'Use Help → Check for Updates to review and install.',
        });
      } else {
        toast.success('You are on the latest version.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check for updates';
      toast.error(message);
    } finally {
      setIsCheckingUpdates(false);
    }
  };

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
            <span className="text-theme-primary font-medium">{formatDisplayVersion(currentVersion)}</span>
          </p>
          <p className="text-theme-secondary">
            <span className="text-theme-muted">Last checked:</span>{' '}
            <span className="text-theme-primary">{formatLastChecked(lastCheckedAt)}</span>
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          loading={isCheckingUpdates}
          onClick={handleCheckForUpdates}
        >
          <RefreshCw style={iconStyle} />
          <span className="ml-1.5">Check for Updates</span>
        </Button>
      </div>
    </div>
  );
}

export default memo(GeneralSettings);
