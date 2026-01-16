/**
 * ProfileView - Profile sidebar navigation.
 * Shows user profile summary; account management is in Settings > Accounts.
 */
import { memo, type CSSProperties } from 'react';
import { UserCircle, Settings } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';

function ProfileView(): JSX.Element {
  const avatarSize = ICON_SIZES.lg * 2;
  const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };
  const iconStyle: CSSProperties = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

  return (
    <div className="flex flex-col h-full">
      {/* User summary */}
      <div className="p-3 border-b border-theme-default">
        <div className="flex items-center gap-3">
          <UserCircle 
            style={avatarStyle} 
            className="text-theme-secondary" 
          />
          <div>
            <p className="text-theme-primary text-sm font-medium">Not signed in</p>
            <p className="text-theme-muted text-xs">View profile details</p>
          </div>
        </div>
      </div>
      
      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 text-theme-muted text-xs">
          <Settings style={iconStyle} />
          <span>Manage accounts in Settings</span>
        </div>
      </div>
    </div>
  );
}

export default memo(ProfileView);
