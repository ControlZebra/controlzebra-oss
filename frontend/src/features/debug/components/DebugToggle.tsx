/**
 * DebugToggle - Enable/disable toggle for debug logging.
 * Calls DebugService.SetEnabled() on toggle.
 * Shows a green dot when active.
 */
import { memo, type CSSProperties } from 'react';
import { Switch } from '../../../components/ui';
import { ICON_SIZES } from '../../../constants';

interface DebugToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

const dotSize = ICON_SIZES.xs * 0.6;
const dotStyle: CSSProperties = {
  width: dotSize,
  height: dotSize,
  borderRadius: '50%',
};

function DebugToggle({ enabled, onToggle }: DebugToggleProps): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <div
        style={dotStyle}
        className={enabled ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.6)]' : 'bg-gray-600'}
        title={enabled ? 'Logging active' : 'Logging inactive'}
      />
      <span className="text-xs text-theme-muted select-none">
        {enabled ? 'On' : 'Off'}
      </span>
      <Switch
        checked={enabled}
        onCheckedChange={onToggle}
        aria-label="Toggle debug logging"
      />
    </div>
  );
}

export default memo(DebugToggle);
