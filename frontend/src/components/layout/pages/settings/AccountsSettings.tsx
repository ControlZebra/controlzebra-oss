/**
 * AccountsSettings - GitHub and GitLab account connection settings.
 */
import { memo, type CSSProperties, type JSX } from 'react';
import { Github } from 'lucide-react';
import { ICON_SIZES } from '../../../../constants';
import { GitLabIcon } from '../../../common';
import { Button } from '../../../ui';

const buttonIconStyle: CSSProperties = { width: ICON_SIZES.md, height: ICON_SIZES.md };

function AccountsSettings(): JSX.Element {
  return (
    <div className="space-y-4">
      {/* GitHub Section */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-4 mb-4">
          <Github style={{ width: 32, height: 32 }} className="text-theme-secondary" />
          <div className="flex-1">
            <h3 className="text-theme-primary font-medium">GitHub</h3>
            <p className="text-theme-muted text-sm">Push, pull, and manage pull requests</p>
          </div>
          <span className="text-theme-muted text-xs uppercase">Not connected</span>
        </div>
        <Button variant="secondary" className="w-full justify-center">
          <Github style={buttonIconStyle} />
          <span className="ml-2">Connect GitHub Account</span>
        </Button>
      </div>
      
      {/* GitLab Section */}
      <div className="bg-theme-surface rounded-lg p-6 border border-theme-default">
        <div className="flex items-center gap-4 mb-4">
          <GitLabIcon style={{ width: 32, height: 32 }} className="text-theme-secondary" />
          <div className="flex-1">
            <h3 className="text-theme-primary font-medium">GitLab</h3>
            <p className="text-theme-muted text-sm">Push, pull, and manage merge requests</p>
          </div>
          <span className="text-theme-muted text-xs uppercase">Not connected</span>
        </div>
        <Button variant="secondary" className="w-full justify-center">
          <GitLabIcon style={buttonIconStyle} />
          <span className="ml-2">Connect GitLab Account</span>
        </Button>
      </div>
      
      <p className="text-xs text-theme-muted text-center pt-2">
        Connecting accounts uses the CLI tools (gh, glab) installed on your system
      </p>
    </div>
  );
}

export default memo(AccountsSettings);
