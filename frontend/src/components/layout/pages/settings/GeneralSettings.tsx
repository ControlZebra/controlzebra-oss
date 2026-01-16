/**
 * GeneralSettings - App preferences including theme selection.
 */
import { memo, type CSSProperties, type JSX } from 'react';
import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useLayout, type Theme } from '../../../../context';
import { ICON_SIZES } from '../../../../constants';

const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

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

function GeneralSettings(): JSX.Element {
  const { theme, setTheme } = useLayout();

  return (
    <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
      {/* Theme Selection */}
      <div className="mb-6">
        <label className="block text-theme-primary text-sm font-medium mb-3">
          Appearance
        </label>
        <p className="text-theme-muted text-sm mb-4">
          Choose how Rewind Logic looks on your device.
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

      {/* More settings can be added here */}
      <div className="border-t border-theme-default pt-6">
        <p className="text-theme-muted text-sm text-center">
          More preferences coming soon
        </p>
      </div>
    </div>
  );
}

export default memo(GeneralSettings);
