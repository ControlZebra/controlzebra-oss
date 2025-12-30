import { memo } from 'react';
import CommitIcon from '@mui/icons-material/Commit';
import TerminalIcon from '@mui/icons-material/Terminal';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { BOTTOM_PANELS, ICON_SIZES } from '../../constants';
import { useLayout } from '../../context';

const iconStyle = { fontSize: ICON_SIZES.xs };

const PANEL_TABS = [
  { id: BOTTOM_PANELS.COMMIT, icon: CommitIcon, label: 'Commit' },
  { id: BOTTOM_PANELS.TERMINAL, icon: TerminalIcon, label: 'Terminal' },
];

function StatusBar() {
  const { 
    activeBottomPanel, 
    setActiveBottomPanel, 
    bottomPanelCollapsed, 
    setBottomPanelCollapsed 
  } = useLayout();

  const handleTabClick = (panelId) => {
    if (activeBottomPanel === panelId && !bottomPanelCollapsed) {
      // Clicking active panel collapses it
      setBottomPanelCollapsed(true);
    } else {
      // Clicking different or collapsed panel opens it
      setActiveBottomPanel(panelId);
      setBottomPanelCollapsed(false);
    }
  };

  return (
    <footer className="h-6 bg-gray-800 border-t border-gray-700 flex items-center justify-between px-2 select-none shrink-0">
      {/* Left: Panel tabs */}
      <div className="flex items-center gap-0.5">
        {PANEL_TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeBottomPanel === tab.id && !bottomPanelCollapsed;
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              title={tab.label}
              className={`
                flex items-center gap-1 px-1.5 py-0.5 rounded text-xs transition-colors
                ${isActive 
                  ? 'text-gray-200 bg-gray-700' 
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700'
                }
              `}
            >
              <Icon sx={iconStyle} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right: Status indicators */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1 text-gray-400">
          <AccountTreeIcon sx={iconStyle} />
          <span>main</span>
        </div>
        
        <div className="flex items-center gap-1 text-green-400">
          <CheckCircleIcon sx={iconStyle} />
          <span>Synced</span>
        </div>

        <div className="flex items-center gap-1 text-yellow-400">
          <ErrorIcon sx={iconStyle} />
          <span>3 changes</span>
        </div>
      </div>
    </footer>
  );
}

export default memo(StatusBar);
