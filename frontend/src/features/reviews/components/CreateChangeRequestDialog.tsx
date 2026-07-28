import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { GitPullRequest } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  Textarea,
  type SelectOption,
} from '../../../shared/ui';
import { ICON_SIZES, VIEWS } from '../../../shared/constants';
import { useLayout, useRepo } from '../../../context';
import type { GitHubChangeRequestBranch } from '../../../domain/repo/context/RepoContext.types';

interface CreateChangeRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The current branch. Change Requests always originate from it. */
  sourceBranch: string;
  /** Preferred default target, typically the repository's default branch. */
  defaultTargetBranch?: string;
}

/**
 * CreateChangeRequestDialog collects the title, description, and target branch
 * for a new Change Request. The source branch is fixed to the current branch.
 * On success (including duplicate routing) it navigates to the Reviews view,
 * where the created or existing request is already selected by RepoContext.
 */
function CreateChangeRequestDialog({
  open,
  onOpenChange,
  sourceBranch,
  defaultTargetBranch,
}: CreateChangeRequestDialogProps): JSX.Element {
  const { setActiveView } = useLayout();
  const { loadChangeRequestTargets, createChangeRequest, isCreatingChangeRequest } = useRepo();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [branches, setBranches] = useState<GitHubChangeRequestBranch[]>([]);
  const [isLoadingTargets, setIsLoadingTargets] = useState(false);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  // Reset inputs and load the selectable target branches each time the dialog
  // opens so the form never shows stale state from a prior branch.
  useEffect(() => {
    if (!open) return;

    setTitle('');
    setDescription('');
    setTargetBranch('');
    setBranches([]);
    setTargetsError(null);
    setIsLoadingTargets(true);

    let cancelled = false;
    void (async () => {
      try {
        const result = await loadChangeRequestTargets();
        if (cancelled) return;
        if (!result.success) {
          setTargetsError(result.error || 'Unable to load target branches.');
          return;
        }

        const available = (result.branches ?? []).filter((branch) => branch.name !== sourceBranch);
        setBranches(available);

        const preferred = [result.defaultBranch, defaultTargetBranch, 'main']
          .find((name) => name && name !== sourceBranch && available.some((branch) => branch.name === name));
        setTargetBranch(preferred ?? available[0]?.name ?? '');
      } catch (error) {
        if (cancelled) return;
        setTargetsError(error instanceof Error ? error.message : 'Unable to load target branches.');
      } finally {
        if (!cancelled) setIsLoadingTargets(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, sourceBranch, defaultTargetBranch, loadChangeRequestTargets]);

  const targetOptions = useMemo((): SelectOption[] =>
    branches.map((branch) => ({
      value: branch.name,
      label: branch.isDefault ? `${branch.name} (default)` : branch.name,
    })), [branches]);

  const trimmedTitle = title.trim();
  const canSubmit = Boolean(trimmedTitle) && Boolean(targetBranch) && targetBranch !== sourceBranch && !isCreatingChangeRequest;

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!trimmedTitle || !targetBranch || targetBranch === sourceBranch) return;

    const result = await createChangeRequest({
      sourceBranch,
      targetBranch,
      title: trimmedTitle,
      body: description.trim(),
    });

    if (result.success) {
      toast.success(result.isDuplicate
        ? 'A Change Request already existed for this branch — opening it.'
        : 'Change Request created.');
      setActiveView(VIEWS.REVIEWS);
      onOpenChange(false);
      return;
    }

    toast.error(result.error || 'Unable to create the Change Request.');
  }, [trimmedTitle, targetBranch, sourceBranch, description, createChangeRequest, setActiveView, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader className="border-b border-theme-default">
          <DialogTitle>Create Change Request</DialogTitle>
          <DialogDescription>
            Propose your changes for review before they are combined into another branch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-4">
          <div>
            <Label className="text-xs text-theme-secondary">Title</Label>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Summarize the changes"
              className="mt-1"
              disabled={isCreatingChangeRequest}
              autoFocus
            />
          </div>

          <div>
            <Label className="text-xs text-theme-secondary">Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add context for reviewers"
              rows={4}
              className="mt-1"
              disabled={isCreatingChangeRequest}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs text-theme-secondary">From branch</Label>
              <Input value={sourceBranch} disabled className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-theme-secondary">Into branch</Label>
              <Select
                value={targetBranch}
                onValueChange={setTargetBranch}
                options={targetOptions}
                placeholder={isLoadingTargets ? 'Loading branches…' : 'Select a branch'}
                disabled={isLoadingTargets || isCreatingChangeRequest || targetOptions.length === 0}
                className="mt-1"
              />
            </div>
          </div>

          {targetsError && <p className="text-sm text-red-400">{targetsError}</p>}
        </div>

        <DialogFooter className="border-t border-theme-default px-6 py-4">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isCreatingChangeRequest}>
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            loading={isCreatingChangeRequest}
          >
            <GitPullRequest size={ICON_SIZES.sm} />
            Create Request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default memo(CreateChangeRequestDialog);
