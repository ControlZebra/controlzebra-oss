/**
 * ProfileView - Profile sidebar navigation.
 * Shows user profile summary; account management is in Settings > Accounts.
 */
import { memo } from 'react';
import { UserCircle, Settings } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';

function ProfileView() {
  const avatarSize = ICON_SIZES.lg * 2;

  return (
    <div className="flex flex-col h-full">
      {/* User summary */}
      <div className="p-3 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <UserCircle 
            style={{ width: avatarSize, height: avatarSize }} 
            className="text-gray-400" 
          />
          <div>
            <p className="text-gray-200 text-sm font-medium">Not signed in</p>
            <p className="text-gray-500 text-xs">View profile details</p>
          </div>
        </div>
      </div>
      
      {/* Info */}
      <div className="p-3">
        <div className="flex items-center gap-2 text-gray-500 text-xs">
          <Settings style={{ width: ICON_SIZES.sm, height: ICON_SIZES.sm }} />
          <span>Manage accounts in Settings</span>
        </div>
      </div>
    </div>
  );
}

export default memo(ProfileView);
