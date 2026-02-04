/**
 * PostHog Analytics Module for ControlZebra
 *
 * Provides centralized analytics tracking functions with consent-level filtering.
 * See docs/technical/POSTHOG_INTEGRATION_STRATEGY.md for event taxonomy.
 * 
 * Event Categories:
 * - 'error': Error and crash events (tracked at all levels including minimal)
 * - 'usage': Core usage patterns like commits, syncs, branch operations (standard+)
 * - 'detailed': Granular UX events like navigation, file opens (full only)
 */

import posthog from 'posthog-js';

// Analytics consent levels
export type AnalyticsConsent = 'minimal' | 'standard' | 'full';

// Event categories determine which consent levels can track them
export type EventCategory = 'error' | 'usage' | 'detailed';

// Get app version from environment
const APP_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

// Cache the current consent level for fast access
let currentConsentLevel: AnalyticsConsent = 'standard';

/**
 * Check if an event category is allowed at the current consent level
 */
function isEventAllowed(category: EventCategory): boolean {
  switch (currentConsentLevel) {
    case 'minimal':
      // Only error events are tracked at minimal level
      return category === 'error';
    case 'standard':
      // Error and usage events are tracked at standard level
      return category === 'error' || category === 'usage';
    case 'full':
      // All events are tracked at full level
      return true;
    default:
      return false;
  }
}

/**
 * Initialize analytics consent from localStorage
 */
export function initAnalytics(): void {
  const storedConsent = localStorage.getItem('analytics_consent') as AnalyticsConsent | null;
  if (storedConsent) {
    setAnalyticsConsent(storedConsent);
  } else {
    // Default to standard consent
    setAnalyticsConsent('standard');
  }
}

/**
 * Set analytics consent level
 * - minimal: errors only (stays opted in but filters events)
 * - standard: usage patterns (opt in, no recording)
 * - full: includes session replay (opt in with recording)
 */
export function setAnalyticsConsent(level: AnalyticsConsent): void {
  currentConsentLevel = level;
  
  // All levels stay opted in so we can track errors at minimum
  // The filtering happens in trackEvent based on category
  posthog.opt_in_capturing();
  
  switch (level) {
    case 'minimal':
    case 'standard':
      posthog.stopSessionRecording?.();
      break;
    case 'full':
      posthog.startSessionRecording?.();
      break;
  }

  localStorage.setItem('analytics_consent', level);
}

/**
 * Get current analytics consent level
 */
export function getAnalyticsConsent(): AnalyticsConsent {
  return (localStorage.getItem('analytics_consent') as AnalyticsConsent) || 'standard';
}

/**
 * Identify a user (anonymous by default for privacy)
 */
export function identifyUser(userId: string, traits?: Record<string, unknown>): void {
  posthog.identify(userId, traits);
}

/**
 * Reset user identity (on logout)
 */
export function resetUser(): void {
  posthog.reset();
}

/**
 * Track an event with consent-level filtering
 * @param eventName - The name of the event
 * @param properties - Optional event properties
 * @param category - Event category: 'error' (minimal+), 'usage' (standard+), 'detailed' (full only)
 */
export function trackEvent(
  eventName: string, 
  properties?: Record<string, unknown>,
  category: EventCategory = 'usage'
): void {
  // Check if this event category is allowed at current consent level
  if (!isEventAllowed(category)) {
    return;
  }

  posthog.capture(eventName, {
    ...properties,
    timestamp: new Date().toISOString(),
    app_version: APP_VERSION,
    consent_level: currentConsentLevel,
    event_category: category,
  });
}

/**
 * Track page/view changes (detailed category - full consent only)
 */
export function trackViewChange(viewName: string, properties?: Record<string, unknown>): void {
  if (!isEventAllowed('detailed')) {
    return;
  }

  posthog.capture('$pageview', {
    $current_url: viewName,
    ...properties,
  });
}

/**
 * Check if a feature flag is enabled
 */
export function isFeatureEnabled(flagName: string): boolean {
  return posthog.isFeatureEnabled(flagName) ?? false;
}

/**
 * Get feature flag value (for multivariate flags)
 */
export function getFeatureFlagValue(flagName: string): string | boolean | undefined {
  return posthog.getFeatureFlag(flagName);
}

// ============================================================================
// Event-specific tracking functions
// ============================================================================

// --- App Lifecycle Events ---

export function trackAppLaunched(properties: {
  platform: string;
  isFirstLaunch: boolean;
}): void {
  trackEvent('app_launched', {
    platform: properties.platform,
    is_first_launch: properties.isFirstLaunch,
  }, 'usage');
}

export function trackAppClosed(properties: {
  sessionDurationSeconds: number;
  reposOpened: number;
}): void {
  trackEvent('app_closed', {
    session_duration_seconds: properties.sessionDurationSeconds,
    repos_opened: properties.reposOpened,
  }, 'usage');
}

// --- Repository Events ---

export function trackRepoOpened(properties: {
  isGitRepo: boolean;
  hasRemote: boolean;
  branchName: string;
  filesCount?: number;
}): void {
  trackEvent('repo_opened', {
    is_git_repo: properties.isGitRepo,
    has_remote: properties.hasRemote,
    branch_name: properties.branchName,
    files_count: properties.filesCount,
  }, 'usage');
}

export function trackRepoClosed(properties: { sessionDurationSeconds: number }): void {
  trackEvent('repo_closed', {
    session_duration_seconds: properties.sessionDurationSeconds,
  }, 'usage');
}

export function trackRepoInitialized(properties: {
  lfsEnabled: boolean;
  initialCommitMade: boolean;
}): void {
  trackEvent('repo_initialized', {
    lfs_enabled: properties.lfsEnabled,
    initial_commit_made: properties.initialCommitMade,
  }, 'usage');
}

export function trackRepoLfsEnabled(properties: { trackedPatternsCount: number }): void {
  trackEvent('repo_lfs_enabled', {
    tracked_patterns_count: properties.trackedPatternsCount,
  }, 'usage');
}

// --- Commit Events ---

export function trackCommitCreated(properties: {
  success: boolean;
  filesChanged: number;
  branchName: string;
  messageLength: number;
  isProtectedBranch: boolean;
  durationMs?: number;
  errorType?: string;
}): void {
  trackEvent('commit_created', {
    success: properties.success,
    files_changed: properties.filesChanged,
    branch_name: properties.branchName,
    message_length: properties.messageLength,
    is_protected_branch: properties.isProtectedBranch,
    duration_ms: properties.durationMs,
    error_type: properties.errorType,
  }, 'usage');
}

export function trackCommitBranchAndSave(properties: {
  newBranchName: string;
  filesChanged: number;
  wasOnProtectedBranch: boolean;
}): void {
  trackEvent('commit_branch_and_save', {
    new_branch_name: properties.newBranchName,
    files_changed: properties.filesChanged,
    was_on_protected_branch: properties.wasOnProtectedBranch,
  }, 'usage');
}

export function trackCommitUndone(properties: { commitsResetCount: number }): void {
  trackEvent('commit_undone', {
    commits_reset_count: properties.commitsResetCount,
  }, 'usage');
}

export function trackChangesDiscarded(properties: {
  filesDiscarded: number;
  wasPartial: boolean;
}): void {
  trackEvent('changes_discarded', {
    files_discarded: properties.filesDiscarded,
    was_partial: properties.wasPartial,
  }, 'usage');
}

// --- Sync Events ---

export function trackSyncStarted(properties: {
  branchName: string;
  localAhead: number;
  localBehind: number;
}): void {
  trackEvent('sync_started', {
    branch_name: properties.branchName,
    local_ahead: properties.localAhead,
    local_behind: properties.localBehind,
  }, 'usage');
}

export function trackSyncCompleted(properties: {
  success: boolean;
  durationMs: number;
  commitsPulled?: number;
  commitsPushed?: number;
}): void {
  trackEvent('sync_completed', {
    success: properties.success,
    duration_ms: properties.durationMs,
    commits_pulled: properties.commitsPulled,
    commits_pushed: properties.commitsPushed,
  }, 'usage');
}

export function trackSyncFailed(properties: {
  errorType: string;
  hadConflicts: boolean;
}): void {
  trackEvent('sync_failed', {
    error_type: properties.errorType,
    had_conflicts: properties.hadConflicts,
  }, 'error');
}

export function trackPushCompleted(properties: {
  success: boolean;
  commitsPushed: number;
}): void {
  trackEvent('push_completed', {
    success: properties.success,
    commits_pushed: properties.commitsPushed,
  }, 'usage');
}

// --- Branch Events ---

export function trackBranchModalOpened(properties: {
  currentBranch: string;
  hasUncommittedChanges: boolean;
}): void {
  trackEvent('branch_modal_opened', {
    current_branch: properties.currentBranch,
    has_uncommitted_changes: properties.hasUncommittedChanges,
  }, 'detailed');
}

export function trackBranchSwitched(properties: {
  fromBranch: string;
  toBranch: string;
  usedStash: boolean;
}): void {
  trackEvent('branch_switched', {
    from_branch: properties.fromBranch,
    to_branch: properties.toBranch,
    used_stash: properties.usedStash,
  }, 'usage');
}

export function trackBranchCreated(properties: {
  branchName: string;
  fromBranch: string;
  movedUncommittedChanges: boolean;
}): void {
  trackEvent('branch_created', {
    branch_name: properties.branchName,
    from_branch: properties.fromBranch,
    moved_uncommitted_changes: properties.movedUncommittedChanges,
  }, 'usage');
}

export function trackProtectedBranchWarningShown(properties: {
  branchName: string;
  actionAttempted: string;
}): void {
  trackEvent('protected_branch_warning_shown', {
    branch_name: properties.branchName,
    action_attempted: properties.actionAttempted,
  }, 'usage');
}

export function trackProtectedBranchNudgeAction(properties: {
  action: 'created_branch' | 'dismissed' | 'saved_anyway';
}): void {
  trackEvent('protected_branch_nudge_action', {
    action: properties.action,
  }, 'usage');
}

// --- History & Diff Events ---

export function trackHistoryViewed(properties: { commitsLoaded: number }): void {
  trackEvent('history_viewed', {
    commits_loaded: properties.commitsLoaded,
  }, 'detailed');
}

export function trackCommitSelected(properties: {
  commitAgeDays: number;
  filesInCommit: number;
}): void {
  trackEvent('commit_selected', {
    commit_age_days: properties.commitAgeDays,
    files_in_commit: properties.filesInCommit,
  }, 'detailed');
}

export function trackDiffViewed(properties: {
  fileExtension: string;
  diffType: 'working' | 'commit';
  linesChanged?: number;
}): void {
  trackEvent('diff_viewed', {
    file_extension: properties.fileExtension,
    diff_type: properties.diffType,
    lines_changed: properties.linesChanged,
  }, 'detailed');
}

// --- Merge/Conflict Events ---

export function trackMergeStarted(properties: {
  sourceBranch: string;
  targetBranch: string;
  isSquash: boolean;
}): void {
  trackEvent('merge_started', {
    source_branch: properties.sourceBranch,
    target_branch: properties.targetBranch,
    is_squash: properties.isSquash,
  }, 'usage');
}

export function trackConflictDetected(properties: {
  conflictedFilesCount: number;
  conflictSource: 'merge' | 'pull';
}): void {
  trackEvent('conflict_detected', {
    conflicted_files_count: properties.conflictedFilesCount,
    conflict_source: properties.conflictSource,
  }, 'usage');
}

export function trackConflictResolved(properties: {
  resolutionStrategy: 'ours' | 'theirs' | 'both' | 'manual';
}): void {
  trackEvent('conflict_resolved', {
    resolution_strategy: properties.resolutionStrategy,
  }, 'usage');
}

export function trackMergeCompleted(properties: {
  totalConflicts: number;
  resolutionStrategiesUsed: string[];
}): void {
  trackEvent('merge_completed', {
    total_conflicts: properties.totalConflicts,
    resolution_strategies_used: properties.resolutionStrategiesUsed,
  }, 'usage');
}

export function trackMergeAborted(properties: { conflictsRemaining: number }): void {
  trackEvent('merge_aborted', {
    conflicts_remaining: properties.conflictsRemaining,
  }, 'usage');
}

// --- Navigation Events ---

export function trackViewChanged(properties: {
  fromView: string;
  toView: string;
}): void {
  trackEvent('view_changed', {
    from_view: properties.fromView,
    to_view: properties.toView,
  }, 'detailed');
}

export function trackSettingsOpened(properties: { category?: string }): void {
  trackEvent('settings_opened', {
    category: properties.category,
  }, 'detailed');
}

export function trackFileOpened(properties: {
  fileExtension: string;
  fileSizeKb?: number;
}): void {
  trackEvent('file_opened', {
    file_extension: properties.fileExtension,
    file_size_kb: properties.fileSizeKb,
  }, 'detailed');
}

// --- Error & Recovery Events ---

export function trackErrorShown(properties: {
  errorCode?: string;
  errorContext: string;
  actionAttempted: string;
}): void {
  trackEvent('error_shown', {
    error_code: properties.errorCode,
    error_context: properties.errorContext,
    action_attempted: properties.actionAttempted,
  }, 'error');
}

export function trackRecoveryBannerShown(properties: {
  stuckStateType: 'merge' | 'rebase' | 'cherry-pick';
}): void {
  trackEvent('recovery_banner_shown', {
    stuck_state_type: properties.stuckStateType,
  }, 'error');
}

export function trackRecoveryActionTaken(properties: {
  action: 'abort' | 'continue' | 'skip';
}): void {
  trackEvent('recovery_action_taken', {
    action: properties.action,
  }, 'error');
}
