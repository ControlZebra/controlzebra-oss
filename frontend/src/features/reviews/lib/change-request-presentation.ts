import { fileKindFromPath } from '../../../shared/constants/file-types';
import type {
  GitHubChangeRequestErrorCode,
  GitHubChangeRequestFile,
} from '../../../domain/repo/context/RepoContext.types';

export type ChangeRequestReviewStatus = 'approved' | 'changes-requested' | 'pending' | 'unavailable';

export interface ChangeRequestFileSummary {
  label: string;
  count: number;
}

export interface ChangeRequestErrorCopy {
  title: string;
  detail: string;
}

const CONFIGURATION_EXTENSIONS = new Set(['csv', 'ini', 'json', 'toml', 'xml', 'yaml', 'yml']);

function extensionFromPath(filePath: string): string {
  return filePath.split('.').pop()?.toLowerCase() ?? '';
}

export function reviewStatusFromDecision(decision: string | null | undefined): ChangeRequestReviewStatus {
  switch ((decision ?? '').toUpperCase()) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes-requested';
    case 'REVIEW_REQUIRED':
      return 'pending';
    default:
      return 'unavailable';
  }
}

/** Short label for compact surfaces such as table cells and badges. */
export function reviewStatusLabel(status: ChangeRequestReviewStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'changes-requested':
      return 'Changes requested';
    case 'pending':
      return 'Review pending';
    default:
      return 'Not available';
  }
}

/** Full sentence for the detail status strip, where the reason matters. */
export function reviewStatusDetail(status: ChangeRequestReviewStatus): string {
  if (status === 'unavailable') {
    return 'Review status not available yet.';
  }
  return reviewStatusLabel(status);
}

/**
 * GitHub reports merge readiness as raw GraphQL enum values. Translate them for
 * users who do not think in Git or GitHub terminology.
 */
export function mergeReadinessLabel(mergeStateStatus: string | null | undefined): string {
  switch ((mergeStateStatus ?? '').toUpperCase()) {
    case 'CLEAN':
      return 'Ready to merge on GitHub';
    case 'HAS_HOOKS':
      return 'Ready to merge after GitHub checks finish';
    case 'UNSTABLE':
      return 'Mergeable, but some GitHub checks did not pass';
    case 'BEHIND':
      return 'Needs the latest changes from the target branch';
    case 'BLOCKED':
      return 'Blocked by GitHub project rules';
    case 'DIRTY':
      return 'Conflicts must be resolved before merging';
    case 'DRAFT':
      return 'Still a draft on GitHub';
    default:
      return 'Not available';
  }
}

export function changeRequestFileSummary(files: GitHubChangeRequestFile[]): ChangeRequestFileSummary[] {
  const counts = { ladder: 0, configuration: 0, media: 0, other: 0 };

  for (const file of files) {
    const kind = fileKindFromPath(file.path);
    if (kind === 'l5x') {
      counts.ladder += 1;
    } else if (kind === 'image' || kind === 'pdf' || kind === 'model3d') {
      counts.media += 1;
    } else if (CONFIGURATION_EXTENSIONS.has(extensionFromPath(file.path))) {
      counts.configuration += 1;
    } else {
      counts.other += 1;
    }
  }

  return [
    { label: 'ladder logic file', count: counts.ladder },
    { label: 'HMI or configuration file', count: counts.configuration },
    { label: 'drawing or media file', count: counts.media },
    { label: 'other project file', count: counts.other },
  ].filter((item) => item.count > 0);
}

export function changeRequestFileSummaryText(files: GitHubChangeRequestFile[]): string {
  const summary = changeRequestFileSummary(files);
  if (summary.length === 0) {
    return 'No project files changed.';
  }
  return summary
    .map((item) => `${item.count} ${item.label}${item.count === 1 ? '' : 's'}`)
    .join(', ');
}

export function changeRequestFileStatusLabel(status: string): string {
  switch (status.toLowerCase()) {
    case 'added':
      return 'Added';
    case 'removed':
    case 'deleted':
      return 'Removed';
    case 'renamed':
      return 'Renamed';
    case 'copied':
      return 'Copied';
    default:
      return 'Changed';
  }
}

/**
 * Single source of user-facing recovery copy for every Change Request surface.
 * Views switch on the stable ErrorCode, never on backend error text.
 */
export function changeRequestErrorCopy(code: GitHubChangeRequestErrorCode): ChangeRequestErrorCopy {
  switch (code) {
    case 'gh_unavailable':
      return {
        title: 'GitHub tools are required',
        detail: 'Install the GitHub CLI to browse Change Requests for this project.',
      };
    case 'auth_required':
      return {
        title: 'Connect GitHub to continue',
        detail: 'Connect GitHub from Settings, then return here to refresh Change Requests.',
      };
    case 'host_unsupported':
      return {
        title: 'This GitHub host is not supported yet',
        detail: 'Change Requests currently support projects connected to github.com only.',
      };
    case 'origin_missing':
      return {
        title: 'This project has no primary GitHub connection',
        detail: 'Add an origin connection for this project before using Change Requests.',
      };
    case 'origin_not_github':
      return {
        title: 'This project is not connected to GitHub',
        detail: 'Change Requests are currently available only for GitHub-connected projects.',
      };
    case 'repository_unresolved':
      return {
        title: 'We could not identify this GitHub project',
        detail: 'Check the origin connection and your GitHub access, then try again.',
      };
    case 'permission_denied':
      return {
        title: 'GitHub did not grant access to this project',
        detail: 'Ask a project administrator to confirm your GitHub permissions.',
      };
    case 'network_unavailable':
      return {
        title: 'GitHub could not be reached',
        detail: 'Check your connection and try again.',
      };
    case 'rate_limited':
      return {
        title: 'GitHub is temporarily limiting requests',
        detail: 'Wait a moment, then refresh Change Requests.',
      };
    default:
      return {
        title: 'Change Requests could not be loaded',
        detail: 'Try refreshing. If this continues, check the GitHub connection in Settings.',
      };
  }
}