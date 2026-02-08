/**
 * ProfileView - Profile sidebar showing ControlZebra account info.
 * Account management is handled in the main area (ProfilePage).
 */
import { memo, useState, type CSSProperties, type JSX } from 'react';
import { UserCircle, Crown, Zap, LogOut } from 'lucide-react';
import { ICON_SIZES } from '../../../constants';
import { useAuth } from '../../../context';
import { Button } from '../../ui';

const avatarSize = ICON_SIZES.lg * 2;
const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };

function ProfileView(): JSX.Element {
  const { isAuthenticated, userName, userEmail, logout } = useAuth();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const plan = 'Free'; // 'Free' | 'Pro' | 'Team'

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await logout();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* ControlZebra Account */}
      <div className="p-4">
        <div className="flex items-center gap-2 text-theme-muted text-xs font-medium uppercase tracking-wide mb-3">
          <Zap size={12} />
          <span>ControlZebra Account</span>
        </div>

        {isAuthenticated ? (
          <div className="space-y-4">
            {/* User Info */}
            <div className="flex items-center gap-3">
              <UserCircle style={avatarStyle} className="text-theme-secondary" />
              <div className="flex-1 min-w-0">
                <p className="text-theme-primary text-sm font-medium truncate">{userName || 'ControlZebra User'}</p>
                <p className="text-theme-muted text-xs truncate">{userEmail || 'Signed in'}</p>
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

            <Button
              variant="secondary"
              size="sm"
              loading={isSigningOut}
              onClick={handleSignOut}
            >
              <LogOut size={12} />
              <span className="ml-1.5">Sign out</span>
            </Button>
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
