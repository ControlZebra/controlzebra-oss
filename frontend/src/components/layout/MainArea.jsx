/**
 * MainArea - Central content area that updates based on active view.
 * 
 * Displays view-specific content:
 * - Explorer: File content viewer
 * - Changes: File diff when a changed file is selected
 * - History: Commit details + file list when a commit is selected
 * - Settings: Full settings panel with forms
 * - Profile: Account management panel with GitHub/GitLab connection
 */
import { memo, useCallback, useState, useEffect } from 'react';
import { 
  FileText, 
  User, 
  Clock, 
  Plus, 
  Minus, 
  Hash,
  ChevronLeft,
  Folder,
  Settings,
  UserCircle,
  Github,
  Mail,
  CheckCircle,
  AlertCircle,
} from 'lucide-react';
import { VIEWS, ICON_SIZES, SETTINGS_CATEGORIES } from '../../constants';
import { useLayout, useRepo } from '../../context';
import { DiffViewer } from '../common';
import { Button, Input, Label } from '../ui';
import { GetUserProfile, SetUserProfile } from '../../../bindings/changeme/services/settingsservice';

const iconStyle = { width: ICON_SIZES.sm, height: ICON_SIZES.sm };

/**
 * CommitHeader - Shows commit metadata (author, date, message).
 */
const CommitHeader = memo(function CommitHeader({ commit, onBack }) {
  return (
    <div className="border-b border-neutral-700 bg-neutral-800">
      {/* Back button when viewing file diff */}
      {onBack && (
        <div className="px-4 py-2 border-b border-neutral-700/50">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft style={iconStyle} />
            <span>Back to commit</span>
          </Button>
        </div>
      )}
      <div className="px-4 py-3">
        <h2 className="text-neutral-100 font-medium mb-2">{commit.message}</h2>
        {commit.body && (
          <p className="text-neutral-400 text-sm mb-3 whitespace-pre-wrap">{commit.body}</p>
        )}
        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <div className="flex items-center gap-1.5">
            <Hash style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span className="font-mono">{commit.shortHash}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <User style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span>{commit.author}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            <span>{commit.relativeDate}</span>
          </div>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-3 mt-3 text-xs">
          <span className="text-neutral-400">
            {commit.stats?.filesChanged || 0} file{commit.stats?.filesChanged !== 1 ? 's' : ''} changed
          </span>
          <span className="text-green-400 flex items-center gap-1">
            <Plus style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            {commit.stats?.additions || 0}
          </span>
          <span className="text-red-400 flex items-center gap-1">
            <Minus style={{ width: ICON_SIZES.xs, height: ICON_SIZES.xs }} />
            {commit.stats?.deletions || 0}
          </span>
        </div>
      </div>
    </div>
  );
});

/**
 * CommitFileList - List of files changed in a commit.
 */
const CommitFileList = memo(function CommitFileList({ files, onFileSelect }) {
  const statusColors = {
    added: 'text-green-400',
    modified: 'text-yellow-400',
    deleted: 'text-red-400',
    renamed: 'text-blue-400',
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="px-4 py-2 text-xs text-neutral-500 uppercase tracking-wide border-b border-neutral-700/50 sticky top-0 bg-neutral-800">
        Changed Files
      </div>
      {files.map((file, idx) => (
        <button
          key={idx}
          onClick={() => onFileSelect(file.path)}
          className="w-full flex items-center gap-2 px-4 py-2 hover:bg-neutral-800/50 transition-colors text-left"
        >
          <FileText style={iconStyle} className="text-neutral-400 shrink-0" />
          <span className="flex-1 text-sm text-neutral-200 truncate font-mono">
            {file.oldPath && file.oldPath !== file.path 
              ? `${file.oldPath} → ${file.path}`
              : file.path
            }
          </span>
          <span className={`text-xs uppercase ${statusColors[file.status] || 'text-neutral-400'}`}>
            {file.status}
          </span>
          <span className="text-xs text-neutral-500 w-16 text-right">
            <span className="text-green-400">+{file.additions}</span>
            {' '}
            <span className="text-red-400">-{file.deletions}</span>
          </span>
        </button>
      ))}
    </div>
  );
});

/**
 * ExplorerMainContent - Main area content for Explorer view.
 */
const ExplorerMainContent = memo(function ExplorerMainContent() {
  const { repoPath } = useRepo();
  
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-neutral-600 px-4">
        <Folder style={{ width: 48, height: 48 }} className="mx-auto mb-4 text-neutral-700" />
        {repoPath ? (
          <>
            <p className="text-base text-neutral-400">File Explorer</p>
            <p className="text-sm mt-1">Double-click a file in the sidebar to view its contents</p>
          </>
        ) : (
          <>
            <p className="text-base text-neutral-400">No folder open</p>
            <p className="text-sm mt-1">Open a folder to browse files</p>
          </>
        )}
      </div>
    </div>
  );
});

/**
 * GitLabIcon - Custom GitLab logo icon.
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

/**
 * ProfileMainContent - Main area content for Profile view.
 * Shows user profile summary and directs to Settings for account management.
 */
const ProfileMainContent = memo(function ProfileMainContent() {
  const avatarSize = ICON_SIZES.lg * 3;
  const { setActiveView, setSelectedSettingsCategory } = useLayout();

  const handleGoToAccounts = useCallback(() => {
    setActiveView(VIEWS.SETTINGS);
    setSelectedSettingsCategory('accounts');
  }, [setActiveView, setSelectedSettingsCategory]);

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <UserCircle 
            style={{ width: avatarSize, height: avatarSize }} 
            className="text-neutral-600 mx-auto mb-4" 
          />
          <h2 className="text-xl text-neutral-200 font-medium">Your Profile</h2>
          <p className="text-neutral-500 mt-1">Manage your identity and connected accounts</p>
        </div>
        
        {/* Quick Status */}
        <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700 mb-4">
          <h3 className="text-neutral-200 font-medium mb-4">Connected Accounts</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <Github style={{ width: 20, height: 20 }} className="text-neutral-400" />
                <span className="text-neutral-300">GitHub</span>
              </div>
              <span className="text-neutral-600 text-sm">Not connected</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3">
                <GitLabIcon style={{ width: 20, height: 20 }} className="text-neutral-400" />
                <span className="text-neutral-300">GitLab</span>
              </div>
              <span className="text-neutral-600 text-sm">Not connected</span>
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
        
        <p className="text-xs text-neutral-600 text-center">
          Go to Settings → Accounts to connect GitHub or GitLab
        </p>
      </div>
    </div>
  );
});

/**
 * GitConfigForm - Form for setting Git user name and email.
 */
const GitConfigForm = memo(function GitConfigForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalValues, setOriginalValues] = useState({ name: '', email: '' });

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await GetUserProfile('');
        setName(profile.name || '');
        setEmail(profile.email || '');
        setOriginalValues({ name: profile.name || '', email: profile.email || '' });
      } catch (err) {
        console.error('Failed to load user profile:', err);
      }
    };
    loadProfile();
  }, []);

  useEffect(() => {
    setHasChanges(name !== originalValues.name || email !== originalValues.email);
  }, [name, email, originalValues]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setMessage(null);
    
    try {
      const result = await SetUserProfile('', { name, email }, true);
      if (result.success) {
        setMessage({ type: 'success', text: 'Git configuration saved' });
        setOriginalValues({ name, email });
        setHasChanges(false);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to save' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to save' });
    }
    
    setIsSaving(false);
    setTimeout(() => setMessage(null), 4000);
  }, [name, email]);

  return (
    <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
      <h3 className="text-neutral-200 font-medium mb-4">Git Identity</h3>
      <p className="text-neutral-500 text-sm mb-6">This information will be used for your commits</p>
      
      <div className="space-y-4">
        <div>
          <Label>
            <User style={iconStyle} />
            <span>Name</span>
          </Label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name for commits"
          />
        </div>
        
        <div>
          <Label>
            <Mail style={iconStyle} />
            <span>Email</span>
          </Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your email for commits"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-6 pt-4 border-t border-neutral-700">
        {message ? (
          <div className={`flex items-center gap-1.5 text-sm ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {message.type === 'success' 
              ? <CheckCircle style={iconStyle} /> 
              : <AlertCircle style={iconStyle} />
            }
            <span>{message.text}</span>
          </div>
        ) : (
          <span className="text-neutral-500 text-sm">Applied globally for all repositories</span>
        )}
        
        <Button
          onClick={handleSave}
          disabled={!hasChanges}
          loading={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
});

/**
 * AccountsSettings - GitHub and GitLab account connection settings.
 */
const AccountsSettings = memo(function AccountsSettings() {
  const buttonIconStyle = { width: ICON_SIZES.md, height: ICON_SIZES.md };

  return (
    <div className="space-y-4">
      {/* GitHub Section */}
      <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
        <div className="flex items-center gap-4 mb-4">
          <Github style={{ width: 32, height: 32 }} className="text-neutral-300" />
          <div className="flex-1">
            <h3 className="text-neutral-200 font-medium">GitHub</h3>
            <p className="text-neutral-500 text-sm">Push, pull, and manage pull requests</p>
          </div>
          <span className="text-neutral-600 text-xs uppercase">Not connected</span>
        </div>
        <Button variant="secondary" className="w-full justify-center">
          <Github style={buttonIconStyle} />
          <span className="ml-2">Connect GitHub Account</span>
        </Button>
      </div>
      
      {/* GitLab Section */}
      <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
        <div className="flex items-center gap-4 mb-4">
          <GitLabIcon style={{ width: 32, height: 32 }} className="text-neutral-300" />
          <div className="flex-1">
            <h3 className="text-neutral-200 font-medium">GitLab</h3>
            <p className="text-neutral-500 text-sm">Push, pull, and manage merge requests</p>
          </div>
          <span className="text-neutral-600 text-xs uppercase">Not connected</span>
        </div>
        <Button variant="secondary" className="w-full justify-center">
          <GitLabIcon style={buttonIconStyle} />
          <span className="ml-2">Connect GitLab Account</span>
        </Button>
      </div>
      
      <p className="text-xs text-neutral-600 text-center pt-2">
        Connecting accounts uses the CLI tools (gh, glab) installed on your system
      </p>
    </div>
  );
});

/**
 * SettingsMainContent - Main area content for Settings view.
 * Shows category-specific settings forms.
 */
const SettingsMainContent = memo(function SettingsMainContent() {
  const { selectedSettingsCategory } = useLayout();
  
  const categoryInfo = SETTINGS_CATEGORIES.find(c => c.id === selectedSettingsCategory) || SETTINGS_CATEGORIES[0];

  const renderCategoryContent = () => {
    switch (selectedSettingsCategory) {
      case 'git-config':
        return <GitConfigForm />;
      case 'general':
        return (
          <div className="bg-neutral-900 rounded-lg p-6 border border-neutral-700">
            <p className="text-neutral-500 text-center">General settings coming soon</p>
          </div>
        );
      case 'accounts':
        return <AccountsSettings />;
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-2xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Settings style={{ width: 24, height: 24 }} className="text-neutral-500" />
            <h2 className="text-xl text-neutral-200 font-medium">{categoryInfo.name}</h2>
          </div>
          <p className="text-neutral-500">{categoryInfo.description}</p>
        </div>
        
        {/* Category content */}
        {renderCategoryContent()}
      </div>
    </div>
  );
});

/**
 * EmptyState - Placeholder when nothing is selected.
 */
const EmptyState = memo(function EmptyState({ activeView }) {
  const VIEW_HINTS = {
    [VIEWS.EXPLORER]: 'Browse your project files',
    [VIEWS.CHANGES]: 'Click on a file to view changes',
    [VIEWS.HISTORY]: 'Click on a commit to view details',
    [VIEWS.SETTINGS]: 'Select a settings category',
    [VIEWS.PROFILE]: 'Connect your accounts',
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center text-neutral-600 px-4">
        <p className="text-base">Select an item from the sidebar</p>
        <p className="text-sm mt-1">{VIEW_HINTS[activeView]}</p>
      </div>
    </div>
  );
});

/**
 * LoadingState - Shows while loading diff/commit data.
 */
const LoadingState = memo(function LoadingState() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-neutral-500 text-sm">Loading...</div>
    </div>
  );
});

function MainArea() {
  const { activeView } = useLayout();
  const { 
    selectedFileIndex,
    repoStatus,
    selectedCommit,
    selectedCommitFile,
    currentDiff,
    isDiffLoading,
    loadCommitFileDiff,
    selectCommit,
  } = useRepo();

  // Handle clicking a file in commit detail view
  const handleCommitFileSelect = useCallback((filePath) => {
    loadCommitFileDiff(filePath);
  }, [loadCommitFileDiff]);

  // Go back from file diff to commit overview
  const handleBackToCommit = useCallback(() => {
    // Re-select the same commit to clear file selection
    if (selectedCommit) {
      selectCommit(selectedCommit.hash);
    }
  }, [selectedCommit, selectCommit]);

  // Render content based on active view
  const renderContent = () => {
    // Handle loading state for diff-related views
    if (isDiffLoading && (activeView === VIEWS.CHANGES || activeView === VIEWS.HISTORY)) {
      return <LoadingState />;
    }

    switch (activeView) {
      case VIEWS.EXPLORER:
        return <ExplorerMainContent />;

      case VIEWS.PROFILE:
        return <ProfileMainContent />;

      case VIEWS.SETTINGS:
        return <SettingsMainContent />;

      case VIEWS.HISTORY:
        // Viewing a file diff from a commit
        if (selectedCommit && selectedCommitFile && currentDiff) {
          return (
            <>
              <CommitHeader commit={selectedCommit} onBack={handleBackToCommit} />
              <div className="flex-1 overflow-hidden min-h-0">
                <DiffViewer fileDiff={currentDiff} showHeader={true} />
              </div>
            </>
          );
        }
        // Commit selected, showing file list
        if (selectedCommit) {
          return (
            <>
              <CommitHeader commit={selectedCommit} />
              <CommitFileList 
                files={selectedCommit.files || []} 
                onFileSelect={handleCommitFileSelect}
              />
            </>
          );
        }
        return <EmptyState activeView={activeView} />;

      case VIEWS.CHANGES:
        // Working tree file selected
        if (selectedFileIndex !== null && currentDiff) {
          return <DiffViewer fileDiff={currentDiff} showHeader={true} />;
        }
        return <EmptyState activeView={activeView} />;

      default:
        return <EmptyState activeView={activeView} />;
    }
  };

  return (
    <main className="flex-1 bg-neutral-800 flex flex-col min-w-0 min-h-0">
      {renderContent()}
    </main>
  );
}

export default memo(MainArea);
