# PostHog Integration Strategy — User Journey Analytics

This document outlines a comprehensive strategy for integrating PostHog analytics into ControlZebra to understand user journeys and improve the product for industrial automation users.

## Current Setup

PostHog is already installed and configured in `frontend/src/main.tsx`:
- Package: `posthog-js: ^1.339.1`
- Provider wraps the entire app
- Error tracking enabled
- Debug mode in development

Environment variables required:
- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_HOST`

### Consent enforcement (actual behavior)

- Default consent level is `standard` when no preference exists.
- `minimal` and `standard` keep analytics opted-in but disable PostHog automatic capture/pageview/session replay.
- `full` enables automatic capture, pageview, pageleave, and session replay.
- Event-level filtering is enforced in `frontend/src/lib/analytics.ts` by category:
  - `error` events: allowed for `minimal`, `standard`, and `full`
  - `usage` events: allowed for `standard` and `full`
  - `detailed` events: allowed for `full` only

---

## User Journey Mapping

### Primary User Personas

1. **New User (Onboarding)**
   - Opens app for first time
   - Opens/selects a folder
   - Initializes git repo (with/without LFS)
   - Makes first commit

2. **Daily User (Core Loop)**
   - Opens existing repo
   - Views changes
   - Commits work ("Save Changes")
   - Syncs with remote
   - Pushes changes

3. **Collaborative User (Branching/Merging)**
   - Creates branches
   - Switches between branches
   - Merges branches
   - Resolves conflicts

4. **Recovery User (Error Recovery)**
   - Undos commits
   - Discards changes
   - Handles sync conflicts
   - Recovers from stuck states

---

## Event Taxonomy

### Naming Convention

Use `object_action` format with snake_case:
- `repo_opened`
- `commit_created`
- `branch_switched`

### Event Categories

#### 1. App Lifecycle Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `app_launched` | App starts | `version`, `platform`, `is_first_launch` |
| `app_closed` | App closes | `session_duration_seconds`, `repos_opened` |

#### 2. Repository Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `repo_opened` | User opens a folder | `is_git_repo`, `has_remote`, `branch_name`, `files_count` |
| `repo_closed` | User closes folder | `session_duration_seconds` |
| `repo_initialized` | Git init on folder | `lfs_enabled`, `initial_commit_made` |
| `repo_lfs_enabled` | LFS enabled on repo | `tracked_patterns_count` |

#### 3. Commit Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `commit_created` | Save Changes clicked | `files_changed`, `branch_name`, `message_length`, `is_protected_branch` |
| `commit_branch_and_save` | Branch and Save used | `new_branch_name`, `files_changed`, `was_on_protected_branch` |
| `commit_undone` | Undo Last Save | `commits_reset_count` |
| `changes_discarded` | Discard Changes | `files_discarded`, `was_partial` |

#### 4. Sync Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `sync_started` | Sync button clicked | `branch_name`, `local_ahead`, `local_behind` |
| `sync_completed` | Sync finishes | `duration_ms`, `success`, `commits_pulled`, `commits_pushed` |
| `sync_failed` | Sync fails | `error_type`, `had_conflicts` |
| `push_completed` | Push finishes | `commits_pushed`, `success` |

#### 5. Branch Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `branch_modal_opened` | Branch button clicked | `current_branch`, `has_uncommitted_changes` |
| `branch_switched` | User switches branch | `from_branch`, `to_branch`, `used_stash` |
| `branch_created` | New branch created | `branch_name`, `from_branch`, `moved_uncommitted_changes` |
| `protected_branch_warning_shown` | Nudge displayed | `branch_name`, `action_attempted` |
| `protected_branch_nudge_action` | User acts on nudge | `action` (created_branch, dismissed, saved_anyway) |

#### 6. History & Diff Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `history_viewed` | History tab opened | `commits_loaded` |
| `commit_selected` | Commit clicked in history | `commit_age_days`, `files_in_commit` |
| `diff_viewed` | File diff opened | `file_extension`, `diff_type` (working, commit), `lines_changed` |

#### 7. Merge/Conflict Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `merge_started` | Merge initiated | `source_branch`, `target_branch`, `is_squash` |
| `conflict_detected` | Conflicts found | `conflicted_files_count`, `conflict_source` (merge, pull) |
| `conflict_resolved` | Single file resolved | `resolution_strategy` (ours, theirs, both, manual) |
| `merge_completed` | All conflicts resolved | `total_conflicts`, `resolution_strategies_used` |
| `merge_aborted` | User aborts merge | `conflicts_remaining` |

#### 8. Navigation Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `view_changed` | ActivityBar navigation | `from_view`, `to_view` |
| `settings_opened` | Settings accessed | `category` |
| `file_opened` | File opened in explorer | `file_extension`, `file_size_kb` |

#### 9. Error & Recovery Events

| Event | Trigger | Properties |
|-------|---------|------------|
| `error_shown` | Error toast/dialog | `error_code`, `error_context`, `action_attempted` |
| `recovery_banner_shown` | Stuck state detected | `stuck_state_type` (merge, rebase, cherry-pick) |
| `recovery_action_taken` | User resolves stuck state | `action` (abort, continue, skip) |

---

## Implementation Plan

### Phase 1: Core Analytics (Week 1)

Create a centralized analytics module:

```typescript
// frontend/src/lib/analytics.ts
import posthog from 'posthog-js';

// User identification (anonymous by default for privacy)
export function identifyUser(userId: string, traits?: Record<string, unknown>) {
  posthog.identify(userId, traits);
}

// Track events with type safety
export function trackEvent(
  eventName: string, 
  properties?: Record<string, unknown>
) {
  posthog.capture(eventName, {
    ...properties,
    timestamp: new Date().toISOString(),
    app_version: import.meta.env.VITE_APP_VERSION || 'dev',
  });
}

// Page/View tracking
export function trackViewChange(viewName: string, properties?: Record<string, unknown>) {
  posthog.capture('$pageview', {
    $current_url: viewName,
    ...properties,
  });
}

// Feature flags (for gradual rollouts)
export function isFeatureEnabled(flagName: string): boolean {
  return posthog.isFeatureEnabled(flagName) ?? false;
}

// Session recording consent
export function setRecordingConsent(consent: boolean) {
  if (consent) {
    posthog.startSessionRecording();
  } else {
    posthog.stopSessionRecording();
  }
}
```

### Phase 2: Hook Integration (Week 1-2)

Create React hooks for common tracking patterns:

```typescript
// frontend/src/hooks/useAnalytics.ts
import { useEffect, useCallback } from 'react';
import { trackEvent, trackViewChange } from '../lib/analytics';

// Track view on mount
export function useTrackView(viewName: string) {
  useEffect(() => {
    trackViewChange(viewName);
  }, [viewName]);
}

// Track timed events (for measuring duration)
export function useTrackTiming(eventName: string) {
  const startTime = useRef<number>(Date.now());
  
  const complete = useCallback((properties?: Record<string, unknown>) => {
    const duration = Date.now() - startTime.current;
    trackEvent(eventName, { duration_ms: duration, ...properties });
  }, [eventName]);
  
  return { complete };
}
```

### Phase 3: Context Integration (Week 2)

Instrument the RepoContext for automatic tracking:

```typescript
// In RepoContext.tsx - wrap key actions

const commitAll = useCallback(async (message: string): Promise<boolean> => {
  const startTime = Date.now();
  const result = await CommitAll(repoPath, message);
  
  trackEvent('commit_created', {
    success: result.success,
    files_changed: repoStatus?.changedFiles?.length ?? 0,
    branch_name: repoInfo?.branch,
    message_length: message.length,
    is_protected_branch: isProtectedBranch(repoInfo?.branch || ''),
    duration_ms: Date.now() - startTime,
  });
  
  return result.success;
}, [repoPath, repoStatus, repoInfo]);
```

### Phase 4: Layout Context Integration (Week 2)

Track navigation patterns:

```typescript
// In LayoutContext.tsx

const setActiveView = useCallback((view: ViewType) => {
  trackEvent('view_changed', {
    from_view: activeView,
    to_view: view,
  });
  _setActiveView(view);
}, [activeView]);
```

---

## Key Funnels to Track

### 1. Onboarding Funnel
```
app_launched → repo_opened → [repo_initialized?] → commit_created
```
Measure: Conversion rate, time to first commit, LFS adoption

### 2. Daily Commit Flow
```
repo_opened → changes_viewed → commit_created → sync_completed
```
Measure: Session frequency, commits per session, sync success rate

### 3. Branch Workflow
```
protected_branch_warning_shown → branch_created → commit_created → merge_started → merge_completed
```
Measure: Branch adoption, merge success rate, conflict resolution time

### 4. Error Recovery
```
error_shown → recovery_action_taken → [success?]
```
Measure: Error frequency, recovery success, common error types

---

## Privacy Considerations

### Default: Privacy-First
- No PII collection by default
- Anonymous user IDs (generated locally)
- No file content or commit message content
- Only aggregate patterns

### Optional: Enhanced Analytics
- User can opt-in via Settings
- Links to GitHub/GitLab account for cohort analysis
- Session recording for UX research (explicit consent)

### Implementation

```typescript
// frontend/src/lib/analytics.ts

export type AnalyticsConsent = 'minimal' | 'standard' | 'full';

export function setAnalyticsConsent(level: AnalyticsConsent) {
  switch (level) {
    case 'minimal':
      posthog.opt_out_capturing();
      break;
    case 'standard':
      posthog.opt_in_capturing();
      posthog.stopSessionRecording();
      break;
    case 'full':
      posthog.opt_in_capturing();
      posthog.startSessionRecording();
      break;
  }
  
  localStorage.setItem('analytics_consent', level);
}
```

Add to Settings page:

```tsx
// In SettingsPage.tsx
<SettingsCategory title="Privacy">
  <SettingRow 
    label="Analytics"
    description="Help improve ControlZebra by sharing usage data"
  >
    <Select 
      value={analyticsConsent}
      onValueChange={setAnalyticsConsent}
    >
      <SelectItem value="minimal">Minimal (errors only)</SelectItem>
      <SelectItem value="standard">Standard (usage patterns)</SelectItem>
      <SelectItem value="full">Full (includes session replay)</SelectItem>
    </Select>
  </SettingRow>
</SettingsCategory>
```

---

## PostHog Dashboard Configuration

### Recommended Dashboards

1. **User Onboarding**
   - First-time users this week
   - Time to first commit
   - LFS adoption rate
   - Drop-off points in onboarding

2. **Core Actions**
   - Daily/weekly active users
   - Commits per user
   - Sync success rate
   - Most used features

3. **Error Tracking**
   - Error frequency by type
   - Recovery success rate
   - Most problematic flows

4. **Feature Usage**
   - Branch creation rate
   - Merge completion rate
   - History view usage
   - Settings changes

### Key Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| **DAU/WAU** | Daily/Weekly active users | Growth trend |
| **Activation Rate** | % users who commit within first session | > 60% |
| **Commit Frequency** | Commits per user per day | Baseline |
| **Sync Success Rate** | % of syncs without error | > 95% |
| **Branch Adoption** | % commits on non-protected branches | > 70% |
| **Conflict Resolution Rate** | % conflicts resolved vs abandoned | > 80% |

---

## Implementation Checklist

### Week 1: Foundation
- [ ] Create `frontend/src/lib/analytics.ts` module
- [ ] Create `frontend/src/hooks/useAnalytics.ts` hooks
- [ ] Add app lifecycle events (launch, close)
- [ ] Add view change tracking to LayoutContext
- [ ] Add analytics consent to Settings

### Week 2: Core Actions
- [ ] Track repo_opened, repo_closed, repo_initialized
- [ ] Track commit_created, changes_discarded, commit_undone
- [ ] Track sync events (started, completed, failed)
- [ ] Track branch events (switched, created)

### Week 3: Advanced Flows
- [ ] Track merge/conflict events
- [ ] Track error and recovery events
- [ ] Track history and diff viewing
- [ ] Add timing measurements for key operations

### Week 4: Analysis & Iteration
- [ ] Configure PostHog dashboards
- [ ] Set up key funnels
- [ ] Create cohorts (new users, power users, etc.)
- [ ] Review initial data and iterate

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/lib/analytics.ts` | **NEW** - Analytics module |
| `frontend/src/hooks/useAnalytics.ts` | **NEW** - React hooks |
| `frontend/src/context/LayoutContext.tsx` | Add view tracking |
| `frontend/src/context/RepoContext.tsx` | Add action tracking |
| `frontend/src/components/layout/pages/settings/GeneralSettings.tsx` | Add consent UI |
| `frontend/src/App.tsx` | Add app lifecycle tracking |

---

## Example: Full Integration for Commit Flow

```typescript
// RepoContext.tsx

import { trackEvent } from '../lib/analytics';

const commitAll = useCallback(async (message: string): Promise<boolean> => {
  const startTime = Date.now();
  const filesChanged = repoStatus?.changedFiles?.length ?? 0;
  const branch = repoInfo?.branch || 'unknown';
  
  try {
    const result = await CommitAll(repoPath!, message);
    
    trackEvent('commit_created', {
      success: result.success,
      files_changed: filesChanged,
      branch_name: branch,
      is_protected_branch: isProtectedBranch(branch),
      message_length: message.length,
      duration_ms: Date.now() - startTime,
    });
    
    if (result.success) {
      toast.success('Changes saved');
    } else {
      toast.error(result.message || 'Failed to save');
    }
    
    return result.success;
  } catch (error) {
    trackEvent('commit_created', {
      success: false,
      error_type: 'exception',
      files_changed: filesChanged,
      branch_name: branch,
    });
    
    throw error;
  }
}, [repoPath, repoStatus, repoInfo]);
```

---

## Notes for Industrial Automation Users

Since ControlZebra targets non-technical industrial automation users:

1. **Avoid tracking sensitive data**
   - No file names/paths (could reveal proprietary system info)
   - No commit messages (could contain project details)
   - No IP addresses or location data

2. **Focus on UX improvements**
   - Track confusion points (errors, aborted actions)
   - Track feature discovery (are users finding branch creation?)
   - Track recovery patterns (how do users fix issues?)

3. **Respect enterprise environments**
   - Support disabling analytics entirely
   - Don't require network for core functionality
   - Queue events for later sync if offline

