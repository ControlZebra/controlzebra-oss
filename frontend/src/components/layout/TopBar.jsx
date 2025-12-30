import { memo } from 'react';
import SyncIcon from '@mui/icons-material/Sync';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import { ICON_SIZES } from '../../constants';

const iconStyle = { fontSize: ICON_SIZES.sm };

function TopBar() {
  return (
    <header className="h-10 bg-gray-900 border-b border-gray-700 flex items-center justify-between px-3 select-none shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-white font-semibold text-sm">Rewind Logic</span>
        <span className="text-gray-500 text-xs">• main</span>
      </div>

      <button className="flex items-center gap-1.5 px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-gray-200 text-xs transition-colors">
        <AccountTreeIcon sx={iconStyle} />
        <span>main</span>
        <KeyboardArrowDownIcon sx={iconStyle} />
      </button>

      <button className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 rounded text-white text-xs font-medium transition-colors">
        <SyncIcon sx={iconStyle} />
        <span>Sync</span>
      </button>
    </header>
  );
}

export default memo(TopBar);
