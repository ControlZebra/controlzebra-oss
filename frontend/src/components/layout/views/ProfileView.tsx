/**
 * ProfileView - Profile sidebar showing ControlZebra account info.
 * Account management is handled in the main area (ProfilePage).
 */
import { memo, type CSSProperties, type JSX } from 'react';
import { UserCircle, Crown, Zap } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';

const avatarSize = ICON_SIZES.lg * 2;
const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };

function ProfileView(): JSX.Element {
  // TODO: Replace with actual ControlZebra auth state when implemented
  const isLoggedIn = false;
  const userName = 'User';
  const email = 'user@example.com';
  const plan = 'Free'; // 'Free' | 'Pro' | 'Team'

  return (
    <div className="flex flex-col h-full">
      {/* ControlZebra Account */}
      <div className="p-4">
        <div className="flex items-center gap-2 text-theme-muted text-xs font-medium uppercase tracking-wide mb-3">
          <Zap size={12} />
          <span>ControlZebra Account</span>
        </div>

        {isLoggedIn ? (
          <div className="space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <UserCircle style={avatarStyle} className="text-theme-secondary" />
              <div className="flex-1 min-w-0">
                <p className="text-theme-primary text-sm font-medium truncate">{userName}</p>
                <p className="text-theme-muted text-xs truncate">{email}</p>
              </div>
            </div>

            {/* Subscription Plan */}
            <div className="bg-theme-surface rounded-lg p-3 border border-theme-default">
              <div className="flex items-center justify-between mb-1">
                <span className="text-theme-muted text-xs">Current Plan</span>
                <div className="flex items-center gap-1">
                  <Crown size={12} className="text-yellow-400" />
                  <span className="text-theme-primary text-xs font-medium">{plan}</span>
                </div>
              </div>
              <p className="text-theme-muted text-[10px]">
                {plan === 'Free' ? 'Upgrade for more features' : 'Thank you for your support!'}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <UserCircle style={avatarStyle} className="text-theme-muted" />
              <div>
                <p className="text-theme-primary text-sm font-medium">Not signed in</p>
                <p className="text-theme-muted text-xs">Sign in to sync settings</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(ProfileView);
