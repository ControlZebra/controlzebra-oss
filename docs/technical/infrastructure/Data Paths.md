# Data Paths

> `services/data_paths.go` — XDG-compliant storage layout with legacy migration.

## Overview

All application data is organized into roaming config (syncs across machines) and local data (machine-specific). On startup, a one-time migration moves legacy `control-zebra` paths to canonical `ControlZebra` paths.

## DataLocations Structure

```go
type DataLocations struct {
    RoamingConfigDir       string  // Settings, repo config
    SettingsFile           string  // settings.json
    RepositorySettingsDir  string  // Per-repo settings by hash
    LocalDataDir           string  // Logs, cache, tools
    LogsDir                string  // Debug logs
    CacheDir               string  // Build artifacts
    ToolsBinDir            string  // Portable binaries (Windows only)
    WebView2Dir            string  // WebView2 runtime (Windows)
    MigrationMarkerFile    string  // data-layout-v1.json
}
```

## Platform Paths

### Windows

| Data | Path |
|------|------|
| Roaming Config | `%APPDATA%\ControlZebra\config\` |
| Settings File | `%APPDATA%\ControlZebra\config\settings.json` |
| Repo Settings | `%APPDATA%\ControlZebra\config\repositories\<repoID>\` |
| Local Data | `%LOCALAPPDATA%\ControlZebra\` |
| Logs | `%LOCALAPPDATA%\ControlZebra\logs\` |
| Portable Tools | `%LOCALAPPDATA%\ControlZebra\tools\bin\` |
| WebView2 | `%LOCALAPPDATA%\ControlZebra\webview2\` |

### macOS

| Data | Path |
|------|------|
| Roaming Config | `~/.config/ControlZebra/config/` |
| Settings File | `~/.config/ControlZebra/config/settings.json` |
| Repo Settings | `~/.config/ControlZebra/config/repositories/<repoID>/` |
| Local Data | `~/Library/Caches/ControlZebra/` |
| Logs | `~/Library/Caches/ControlZebra/logs/` |
| Portable Tools | N/A (uses system binaries) |

## Data Layout Migration

On startup, `RunDataLayoutMigration()`:

1. Checks for `data-layout-v1.json` marker file
2. If missing → this is a fresh install or pre-migration install
3. If pre-migration data exists at legacy paths (`control-zebra` → `ControlZebra`):
   - Copies settings, repo configs
   - Non-destructive: existing files at target are **not** overwritten
4. Writes `data-layout-v1.json` marker to prevent re-migration

### Legacy Paths (pre-migration)

```
Windows: %APPDATA%\control-zebra\  →  %APPDATA%\ControlZebra\
macOS:   ~/.config/control-zebra/  →  ~/.config/ControlZebra/
```

## Per-Repo Settings Location

Each repository gets a unique directory based on its path hash:

```go
repoID := sha256(repoPath)[:16]  // First 16 hex chars
settingsPath := filepath.Join(RepositorySettingsDir, repoID, "settings.json")
```

This allows settings to persist even if the repo is moved or renamed (though the hash would change).

## Access Pattern

Always use `GetDataLocationsSnapshot()` to get current paths:

```go
locations := GetDataLocationsSnapshot()
settingsFile := locations.SettingsFile
```

Never hardcode paths or construct them manually.

---

**Related:** [[SettingsService]] | [[RepositorySettingsService]] | [[Backend Architecture]]
