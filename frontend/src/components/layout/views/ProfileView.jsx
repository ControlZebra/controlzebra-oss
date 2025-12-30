/**
 * ProfileView - User profile and account connections view.
 * Allows users to connect GitHub and GitLab accounts.
 */
import { memo } from 'react';
import { UserCircle, Github } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { Button } from '../../ui';

/**
 * GitLabIcon - Custom GitLab logo icon.
 * Lucide doesn't include GitLab, so we use a simple SVG.
 */
function GitLabIcon({ className, style }) {
  return (
    <svg 
      viewBox="0 0 24 24" 
      fill="currentColor" 
      className={className}
      style={style}
    >
      <path d="M23.955 13.587l-1.342-4.135-2.664-8.189a.455.455 0 00-.867 0L16.418 9.45H7.582L4.919 1.263a.455.455 0 00-.867 0L1.386 9.452.044 13.587a.924.924 0 00.331 1.023L12 23.054l11.625-8.443a.92.92 0 00.33-1.024" />
    </svg>
  );
}

function ProfileView() {
  const avatarSize = ICON_SIZES.lg * 2;
  const buttonIconStyle = { width: ICON_SIZES.md, height: ICON_SIZES.md };

  return (
    <div className="p-3 space-y-4">
      {/* User avatar and status */}
      <div className="flex items-center gap-3">
        <UserCircle 
          style={{ width: avatarSize, height: avatarSize }} 
          className="text-gray-400" 
        />
        <div>
          <p className="text-gray-200 text-sm font-medium">Not signed in</p>
          <p className="text-gray-500 text-xs">Sign in to connect accounts</p>
        </div>
      </div>
      
      {/* Account connection buttons */}
      <div className="space-y-2">
        <Button variant="secondary" className="w-full justify-start">
          <Github style={buttonIconStyle} />
          Connect GitHub
        </Button>
        <Button variant="secondary" className="w-full justify-start">
          <GitLabIcon style={buttonIconStyle} />
          Connect GitLab
        </Button>
      </div>
    </div>
  );
}

export default memo(ProfileView);
