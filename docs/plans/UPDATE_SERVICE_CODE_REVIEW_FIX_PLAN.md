# Update Service Code Review — Fix Plan

Fixes derived from secondary review of the Update Service + Windows Frameless Titlebar + Color Migration changeset.

Scope for this revision:

1. Include only issues validated as real user-impacting or correctness-impacting defects.
2. Keep low-value cleanup separate from actual bug fixes.
3. Remove items from the prior draft whose rationale does not hold after source inspection.

---

## Fix 1 — Prevent stale AppSettings overwrite from the update toggle

Problem:

`GeneralSettings` reads `AppSettings` once on mount, stores that snapshot in local component state, and later writes the full object back when the auto-download toggle changes.

Current flow:

1. `GetAppSettings()` runs once in `useEffect`
2. `appSettings` is cached in component state
3. `handleAutoDownloadChange()` clones that cached object and calls `SaveAppSettings(nextSettings)`

That is unsafe because `settings.json` is not owned solely by this component. Other flows update the same file, including repository open/close paths that update `lastRepoPath` and other fields. If the user opens Settings, then changes repo state elsewhere, then flips the toggle, the stale cached object can overwrite newer persisted settings.

Observed affected fields in the shared settings model:

1. `theme`
2. `lastRepoPath`
3. `recentFolders`
4. `autoDownloadUpdates`

Fix:

### 1a. Do not save from a stale cached snapshot

Before saving, re-read the current settings from the backend and merge only the changed field:

```ts
const handleAutoDownloadChange = useCallback((checked: boolean) => {
    const previousSettings = appSettings;

    setAppSettings((current) => current ? { ...current, autoDownloadUpdates: checked } : current);

    void GetAppSettings()
        .then((currentSettings) => SaveAppSettings({
            ...currentSettings,
            autoDownloadUpdates: checked,
        }))
        .catch(() => {
            setAppSettings(previousSettings);
            toast.error('Could not save update settings.');
        });
}, [appSettings]);
```

The exact implementation can vary, but the contract must be:

1. Read current backend state at save time
2. Merge only `autoDownloadUpdates`
3. Avoid clobbering unrelated fields
4. Revert optimistic UI state on failure

### 1b. Consider a dedicated backend setter if we want to remove whole-object writes

If this pattern appears again, add a targeted backend method such as:

```go
func (s *SettingsService) SetAutoDownloadUpdates(enabled bool) error
```

That is optional for this pass. The required fix is to stop whole-object stale writes from the frontend.

Files changed:

1. `frontend/src/features/settings/components/GeneralSettings.tsx`

Tests:

1. Add a component test covering this sequence:
     a. initial `GetAppSettings()` resolves with one settings object
     b. a later save-time `GetAppSettings()` resolves with a newer `lastRepoPath` or `recentFolders`
     c. toggling auto-download preserves those newer fields when `SaveAppSettings()` is called

---

## Fix 2 — Disable or gate the auto-download switch until settings are loaded

Problem:

The switch currently renders with `checked={appSettings?.autoDownloadUpdates ?? true}`, which makes it appear enabled immediately. But the change handler returns early when `appSettings` is still null.

Result:

1. The control looks interactive before settings have loaded
2. Clicking it during that window can do nothing
3. The user gets no feedback that the toggle was ignored

This is a user-facing behavior bug, not just polish.

Fix:

### 2a. Add explicit loading readiness for app settings

Track whether settings have been loaded successfully:

```ts
const [appSettings, setAppSettings] = useState<AppSettings | null>(null);
const [appSettingsLoaded, setAppSettingsLoaded] = useState(false);
```

Set `appSettingsLoaded` once the initial settings request completes.

### 2b. Disable the switch until settings are ready

```ts
<Switch
    checked={appSettings?.autoDownloadUpdates ?? true}
    disabled={!appSettingsLoaded}
    onCheckedChange={handleAutoDownloadChange}
    aria-label="Download updates automatically"
/>
```

Alternative acceptable behavior:

1. Hide the switch until loaded
2. Show a loading skeleton or muted placeholder
3. Keep the switch visible but explicitly disabled with helper text

The key requirement is that the UI must not present a live control whose handler is guaranteed to no-op.

Files changed:

1. `frontend/src/features/settings/components/GeneralSettings.tsx`

Tests:

1. Add a component test verifying the switch is disabled before settings load
2. Add a component test verifying it becomes interactive after settings load

---

## Optional Cleanup — Use `defaultAppSettings()` consistently

Problem:

`GetAppSettings()` currently redefines the same defaults inline instead of reusing `defaultAppSettings()`.

This is real duplication, but not a correctness defect on its own.

Fix:

```go
settings := defaultAppSettings()
```

Files changed:

1. `services/settings_service.go`

Rationale:

1. Improves maintainability
2. Prevents future default drift
3. Not required to fix the validated bugs above

---

## Optional Cleanup — Simplify `decodeAppSettings`

Problem:

`decodeAppSettings` currently unmarshals twice: once into the struct and once into a raw map to detect whether `autoDownloadUpdates` was present.

This is functionally correct, but more complicated than necessary.

Fix:

Pre-seed defaults before `json.Unmarshal`:

```go
func decodeAppSettings(data []byte, settings *AppSettings) {
    settings.AutoDownloadUpdates = true
    settings.Theme = defaultAppSettings().Theme

    _ = json.Unmarshal(data, settings)

    if strings.TrimSpace(settings.Theme) == "" {
        settings.Theme = defaultAppSettings().Theme
    }
}
```

Files changed:

1. `services/settings_service.go`

Tests:

1. Keep existing settings tests
2. Ensure coverage still verifies:
     a. missing `autoDownloadUpdates` => `true`
     b. explicit `false` => `false`
     c. explicit `true` => `true`

Rationale:

1. Worth doing if already touching the file
2. Not a high-priority defect by itself

---

## Optional Cleanup — Small frontend consistency fixes

These items are valid cleanup but are not review findings.

| Item | File | Change |
|------|------|--------|
| Hoist repeated `ICON_SIZES.sm` style object | `frontend/src/widgets/layout/TopBar.tsx` | Add `iconSmStyle` and reuse it |
| Hardcoded `size={16}` | `frontend/src/widgets/layout/NonGitFolderPromptModal.tsx` | Replace with `ICON_SIZES.sm` |
| Missing trailing newline | `UpdateContext.tsx`, `window.ts`, `window.test.ts`, `TopBar.test.tsx` | Add newline at EOF |
| Mixed help text indentation | `cmd/updater/main.go` | Align multiline help output |

Rationale:

1. These do not affect correctness
2. Safe to include only if already editing those files

---

## Removed From Prior Draft

The following items were in the previous draft but do not currently justify inclusion as fixes.

### Removed — Pass shared `SettingsService` into `UpdateService`

Reason:

`UpdateService` currently constructs its own `SettingsService`, but the stated “cache coherence” problem is not real in the current implementation. `SettingsService.GetAppSettings()` reads from disk on each call and does not maintain an in-memory cache that can drift. Sharing the instance would be a tidy refactor, not a validated bug fix.

Verdict:

1. Do not include as a required fix
2. Revisit only if `SettingsService` later gains caching or mutable in-memory state

### Removed — Add `CheckForUpdate` concurrency guard

Reason:

Concurrent checks can spawn duplicate `cz-updater check` subprocesses, but the correctness-sensitive download path is already serialized and deduplicated by `getOrStartDownloadSession`. This is better classified as throttling or optimization work than as a bug requiring immediate remediation.

Verdict:

1. Do not include as a required fix in this plan
2. Consider separately if duplicate checks become noisy in telemetry or logs

---

## Excluded Items From Earlier Review Passes

| Finding | Verdict | Rationale |
|---------|---------|-----------|
| D1 — `AppUpdateProgress` builder | Skip | Struct literals remain clearer than a generic builder here. |
| D2 — Shared update display helper | Skip | TopBar and GeneralSettings derive different UI states; forced sharing adds coupling. |
| D3 — Consolidate `clearStagedArtifactState` calls | Skip | Existing early-return pattern is clear and idiomatic. |
| P3 — GeneralSettings independent settings fetch | Skip | Settings page legitimately needs full `AppSettings`; this is not the bug. |
| C1 — `isAutoDownloadEnabled` without mutex | Skip | Current settings read path is safe; no shared mutable cache is involved. |
| C3 — `UpdateProvider` outside `LayoutProvider` | Skip | Intentional and structurally fine. |

---

## Execution Order

1. **Fix 1** — prevent stale whole-object settings overwrite in `GeneralSettings`
2. **Fix 2** — disable or otherwise gate the toggle until settings are loaded
3. **Optional Cleanup** — replace inline defaults in `GetAppSettings()` with `defaultAppSettings()` if touching settings code
4. **Optional Cleanup** — simplify `decodeAppSettings()` if touching settings code
5. **Optional Cleanup** — frontend/style consistency batch only if convenient
