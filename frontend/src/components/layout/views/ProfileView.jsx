import { memo } from 'react';
import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import GitHubIcon from '@mui/icons-material/GitHub';
import { ICON_SIZES } from '../../../constants';

function ProfileView() {
  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center gap-3">
        <AccountCircleIcon sx={{ fontSize: ICON_SIZES.lg * 2 }} className="text-gray-400" />
        <div>
          <p className="text-gray-200 text-sm font-medium">Not signed in</p>
          <p className="text-gray-500 text-xs">Sign in to connect accounts</p>
        </div>
      </div>
      
      <div className="space-y-2">
        <button className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-gray-200 transition-colors">
          <GitHubIcon sx={{ fontSize: ICON_SIZES.md }} />
          Connect GitHub
        </button>
        <button className="w-full flex items-center gap-2 px-3 py-2 bg-gray-700/50 hover:bg-gray-700 rounded text-sm text-gray-200 transition-colors">
          <GitHubIcon sx={{ fontSize: ICON_SIZES.md }} />
          Connect GitLab
        </button>
      </div>
    </div>
  );
}

export default memo(ProfileView);
