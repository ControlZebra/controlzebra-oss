import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Github, Lock, Globe } from 'lucide-react';
import { ICON_SIZES } from '../../../shared/constants';
import { Button, Input, Select, ToggleGroup, type SelectOption, type ToggleGroupOption } from '../../../shared/ui';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '../../../shared/ui/alert-dialog';
import { getFolderNameFromPath } from '../../../shared/utils/path';
import type { GitHubAuthStatus, GitHubOrganization, GitHubOrganizationsResult } from '../../../context';

const VISIBILITY_OPTIONS: ToggleGroupOption[] = [
  { value: 'private', label: 'Private', icon: <Lock size={12} /> },
  { value: 'public', label: 'Public', icon: <Globe size={12} /> },
];

interface PublishToCloudModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublishToGitHub?: (name: string, isPrivate: boolean, owner: string) => Promise<void>;
  onConnectGitHub?: () => void;
  onLoadOrganizations?: () => Promise<GitHubOrganizationsResult>;
  isPublishing?: boolean;
  ghInstalled?: boolean;
  onInstallRequiredPackages?: () => Promise<boolean>;
  isInstallingPackages?: boolean;
  ghAuthStatus?: GitHubAuthStatus | null;
  repoPath?: string;
}

function PublishToCloudModal({
  open,
  onOpenChange,
  onPublishToGitHub,
  onConnectGitHub,
  onLoadOrganizations,
  isPublishing = false,
  ghInstalled = false,
  onInstallRequiredPackages,
  isInstallingPackages = false,
  ghAuthStatus,
  repoPath,
}: PublishToCloudModalProps): JSX.Element {
  const [repoName, setRepoName] = useState('my-repo');
  const [visibility, setVisibility] = useState('private');
  const [selectedOwner, setSelectedOwner] = useState('');
  const [username, setUsername] = useState('');
  const [organizations, setOrganizations] = useState<GitHubOrganization[]>([]);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(false);

  const ownerOptions = useMemo((): SelectOption[] => {
    const options: SelectOption[] = [];
    if (username) {
      options.push({ value: username, label: `${username} (personal)` });
    }
    organizations.forEach((org) => {
      options.push({ value: org.login, label: org.name || org.login });
    });
    return options;
  }, [username, organizations]);

  // Reset form values when modal opens
  useEffect(() => {
    if (!open) return;
    const defaultRepoName = repoPath ? getFolderNameFromPath(repoPath) : 'my-repo';
    setRepoName(defaultRepoName);
    setVisibility('private');
  }, [open, repoPath]);

  // Load organizations when authenticated and modal is open
  useEffect(() => {
    const loadOrgs = async () => {
      if (!open || !ghAuthStatus?.loggedIn || !onLoadOrganizations) return;

      setIsLoadingOrgs(true);
      try {
        const result = await onLoadOrganizations();
        if (result.success) {
          setUsername(result.username);
          setOrganizations(result.organizations);
          setSelectedOwner((prev) => prev || result.username);
        }
      } finally {
        setIsLoadingOrgs(false);
      }
    };

    loadOrgs();
  }, [open, ghAuthStatus?.loggedIn, onLoadOrganizations]);

  const handlePublish = useCallback(async () => {
    if (!onPublishToGitHub || !repoName.trim() || !selectedOwner) return;

    const owner = selectedOwner === username ? '' : selectedOwner;
    await onPublishToGitHub(repoName.trim(), visibility === 'private', owner);
    onOpenChange(false);
  }, [onPublishToGitHub, repoName, selectedOwner, username, visibility, onOpenChange]);

  const handlePublishAction = useCallback((event: React.MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    void handlePublish();
  }, [handlePublish]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Github size={ICON_SIZES.sm} />
            Publish to Cloud
          </AlertDialogTitle>
          <AlertDialogDescription>
            Publish this local project to GitHub for backup and collaboration.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 pb-2 space-y-4">
          {!ghAuthStatus?.loggedIn ? (
            <div className="text-center py-2">
              <p className="text-theme-muted text-xs mb-3">
                Connect your GitHub account to publish this project.
              </p>
              <Button
                size="sm"
                onClick={onConnectGitHub}
                disabled={!ghInstalled || isInstallingPackages}
              >
                <Github size={ICON_SIZES.xs} />
                Connect GitHub
              </Button>
              {!ghInstalled && (
                <div className="mt-2 space-y-2">
                  <p className="text-yellow-400 text-xs">
                    {isInstallingPackages ? 'Installing GitHub CLI… Please wait.' : 'GitHub CLI is required to publish.'}
                  </p>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onInstallRequiredPackages}
                    loading={isInstallingPackages}
                    disabled={!onInstallRequiredPackages || isInstallingPackages}
                  >
                    <Github size={ICON_SIZES.xs} />
                    {isInstallingPackages ? 'Installing...' : 'Install GitHub CLI'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Repository name */}
              <div>
                <label className="block text-xs text-theme-secondary mb-1.5 font-medium">
                  Repository Name
                </label>
                <Input
                  id="publish-cloud-repo-name"
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-repo"
                />
              </div>

              {/* Organization picker */}
              <div>
                <label className="block text-xs text-theme-secondary mb-1.5 font-medium">
                  Organization
                </label>
                <Select
                  value={selectedOwner}
                  onValueChange={setSelectedOwner}
                  options={ownerOptions}
                  placeholder={isLoadingOrgs ? 'Loading…' : 'Personal account'}
                  disabled={isLoadingOrgs}
                />
              </div>

              {/* Visibility */}
              <div className="lg:col-span-2">
                <label className="block text-xs text-theme-secondary mb-1.5 font-medium">
                  Visibility
                </label>
                <ToggleGroup
                  value={visibility}
                  onValueChange={setVisibility}
                  options={VISIBILITY_OPTIONS}
                  disabled={isPublishing}
                />
                <p className="text-theme-muted text-xs mt-1.5">
                  {visibility === 'private'
                    ? 'Only you and collaborators can view this repository'
                    : 'Anyone on the internet can view this repository'}
                </p>
              </div>
            </div>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="default"
            onClick={handlePublishAction}
            loading={isPublishing}
            disabled={!ghAuthStatus?.loggedIn || !repoName.trim() || !selectedOwner}
          >
            <Github size={ICON_SIZES.xs} />
            Publish to Cloud
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(PublishToCloudModal);
