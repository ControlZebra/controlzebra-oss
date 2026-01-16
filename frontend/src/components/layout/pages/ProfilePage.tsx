/**
 * ProfilePage - Main area content for Profile view.
 * Shows user profile summary and directs to Settings for account management.
 */
import { memo, useCallback, type CSSProperties } from 'react';
import { UserCircle, Github } from 'lucide-react';
import { VIEWS, ICON_SIZES } from '../../../constants';
import { useLayout } from '../../../context';
import { GitLabIcon } from '../../common';
import { Button } from '../../ui';

// ============================================================================
// Styles
// ============================================================================

const accountIconStyle: CSSProperties = { width: 20, height: 20 };

// ============================================================================
// Component
// ============================================================================

function ProfilePage(): JSX.Element {
  const avatarSize = ICON_SIZES.lg * 3;
  const { setActiveView, setSelectedSettingsCategory } = useLayout();

  const handleGoToAccounts = useCallback((): void => {
    setActiveView(VIEWS.SETTINGS);
    setSelectedSettingsCategory('accounts');
  }, [setActiveView, setSelectedSettingsCategory]);

  const avatarStyle: CSSProperties = { width: avatarSize, height: avatarSize };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <UserCircle 
            style={avatarStyle} 
            className="text-theme-muted mx-auto mb-4" 
          />
          <h2 className="text-xl text-theme-primary font-medium">Your Profile</h2>
          <p className="text-theme-muted mt-1">Manage your identity and connected accounts</p>
        </div>
        
        {/* Quick Status */}
        <div className="bg-theme-surface rounded-lg p-6 border border-theme-default mb-4">
          <h3 className="text-theme-primary font-medium mb-4">Connected Accounts</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Github style={accountIconStyle} className="text-theme-secondary" />
                <span className="text-theme-secondary">GitHub</span>
              </div>
              <span className="text-theme-muted text-sm">Not connected</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <GitLabIcon style={accountIconStyle} className="text-theme-secondary" />
                <span className="text-theme-secondary">GitLab</span>
              </div>
              <span className="text-theme-muted text-sm">Not connected</span>
            </div>
          </div>
          <Button 
            variant="secondary" 
            className="w-full justify-center mt-4"
            onClick={handleGoToAccounts}
          >
            Manage Accounts in Settings
          </Button>
        </div>
        
        <p className="text-xs text-theme-muted text-center">
          Go to Settings → Accounts to connect GitHub or GitLab
        </p>
      </div>
    </div>
  );
}

export default memo(ProfilePage);
