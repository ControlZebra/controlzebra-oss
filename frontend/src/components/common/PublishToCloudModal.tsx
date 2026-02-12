import { memo, useState, useEffect, useMemo, useCallback } from 'react';
import { Github, Lock, Globe } from 'lucide-react';
import { ICON_SIZES } from '../../constants';
import { Button, Input, Label, Select, type SelectOption } from '../ui';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from '../ui/alert-dialog';
import { cn } from '../../lib/utils';
import type { GitHubAuthStatus, GitHubOrganization, GitHubOrganizationsResult } from '../../context/RepoContext.types';

interface PublishToCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublishToGitHub?: (name: string, isPrivate: boolean, owner: string) => Promise<void>;
  onConnectGitHub?: () => void;
  onLoadOrganizations?: () => Promise<GitHubOrganizationsResult>;
  isPublishing?: boolean;
  ghInstalled?: boolean;
  ghAuthStatus?: GitHubAuthStatus | null;
  repoPath?: string;
}

function PublishToCloudModal({
  isOpen,
  onClose,
  onPublishToGitHub,
  onConnectGitHub,
  onLoadOrganizations,
  isPublishing = false,
  ghInstalled = false,
  ghAuthStatus,
  repoPath,
}: PublishToCloudModalProps): JSX.Element {
  const [repoName, setRepoName] = useState('my-repo');
  const [isPrivate, setIsPrivate] = useState(true);
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
    if (!isOpen) return;
    const defaultRepoName = repoPath?.split('/').pop() || 'my-repo';
    setRepoName(defaultRepoName);
    setIsPrivate(true);
  }, [isOpen, repoPath]);

  // Load organizations when authenticated and modal is open
  useEffect(() => {
    const loadOrgs = async () => {
      if (!isOpen || !ghAuthStatus?.loggedIn || !onLoadOrganizations) return;

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
  }, [isOpen, ghAuthStatus?.loggedIn, onLoadOrganizations]);

  const handlePublish = useCallback(async () => {
    if (!onPublishToGitHub || !repoName.trim() || !selectedOwner) return;

    const owner = selectedOwner === username ? '' : selectedOwner;
    await onPublishToGitHub(repoName.trim(), isPrivate, owner);
    onClose();
  }, [onPublishToGitHub, repoName, selectedOwner, username, isPrivate, onClose]);

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Github size={ICON_SIZES.sm} />
            Publish to Cloud
          </AlertDialogTitle>
          <AlertDialogDescription>
            Publish this local project to GitHub for backup and collaboration.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="px-6 pb-2 space-y-3">
          {!ghAuthStatus?.loggedIn ? (
            <div className="text-center py-2">
              <p className="text-theme-muted text-xs mb-3">
                Connect your GitHub account to publish this project.
              </p>
              <Button
                size="sm"
                onClick={onConnectGitHub}
                disabled={!ghInstalled}
              >
                <Github size={ICON_SIZES.xs} />
                Connect GitHub
              </Button>
              {!ghInstalled && (
                <p className="text-yellow-400 text-xs mt-2">GitHub CLI not installed</p>
              )}
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="publish-cloud-repo-name" className="text-left">
                  Repository Name
                </Label>
                <Input
                  id="publish-cloud-repo-name"
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-repo"
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <Label className="text-left">Visibility</Label>
                  <button
                    type="button"
                    onClick={() => setIsPrivate((v) => !v)}
                    className={cn(
                      'flex h-9 w-full items-center gap-2 rounded border border-theme-default bg-theme-surface px-3 text-sm transition-colors',
                      'hover:border-theme-hover'
                    )}
                  >
                    {isPrivate ? (
                      <>
                        <Lock size={14} className="text-theme-muted" /> Private
                      </>
                    ) : (
                      <>
                        <Globe size={14} className="text-theme-muted" /> Public
                      </>
                    )}
                  </button>
                </div>

                <div className="flex-1">
                  <Label className="text-left">Owner</Label>
                  <Select
                    value={selectedOwner}
                    onValueChange={setSelectedOwner}
                    options={ownerOptions}
                    placeholder={isLoadingOrgs ? 'Loading...' : 'Select owner'}
                    disabled={isLoadingOrgs}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isPublishing}>Cancel</AlertDialogCancel>
          <Button
            onClick={handlePublish}
            loading={isPublishing}
            disabled={!ghAuthStatus?.loggedIn || !repoName.trim() || !selectedOwner}
          >
            <Github size={ICON_SIZES.xs} />
            Publish to Cloud
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default memo(PublishToCloudModal);
