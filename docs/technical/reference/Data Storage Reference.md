# Data Storage Reference

> Platform-specific data paths managed by [[Data Paths|`services/data_paths.go`]].

## Path Layout

| Data Class | Windows | macOS |
|---|---|---|
| **Config (roaming)** | `%APPDATA%\ControlZebra\config\` | `~/.config/ControlZebra/config/` |
| **Settings file** | `…\config\settings.json` | `…/config/settings.json` |
| **Repo settings** | `…\config\repositories\<hash>.json` | `…/config/repositories/<hash>.json` |
| **Local data** | `%LOCALAPPDATA%\ControlZebra\` | `~/Library/Caches/ControlZebra/` |
| **Logs** | `…\ControlZebra\logs\` | `…/ControlZebra/logs/` |
| **Portable tools** | `…\ControlZebra\tools\bin\` | N/A (uses system) |

## settings.json

Managed by [[SettingsService]]:

```json
{
    "theme": "system",          // "light" | "dark" | "system"
    "lastOpenedFolder": "/path/to/repo",
    "recentFolders": ["/path/to/repo1", "/path/to/repo2"],
    "analyticsEnabled": true,
    "autoUpdatesEnabled": true
}
```

## Repository Settings

Per-repo configuration managed by [[RepositorySettingsService]], stored in `repositories/<sha256-of-path>.json`:

```json
{
    "repoPath": "/Users/dev/my-project",
    "protectedBranches": ["main", "release"],
    "protectedBranchAction": "warn",
    "autoFetchEnabled": true,
    "autoFetchIntervalMinutes": 5,
    "lfsFetchEnabled": true,
    "lfsFetchIntervalMinutes": 10,
    "maintenanceEnabled": true,
    "maintenanceIntervalMinutes": 30,
    "defaultMergeType": "squash",
    "commitMessageTemplate": ""
}
```

## Hash Calculation

Repo settings filenames use SHA-256 hash of the absolute repo path:

```go
func hashRepoPath(repoPath string) string {
    h := sha256.Sum256([]byte(repoPath))
    return hex.EncodeToString(h[:])
}
// "/Users/dev/my-project" → "a3f8c1d2...json"
```

## Legacy Migration

On startup, `data_paths.go` checks for legacy directory names and migrates:

| Old Path | New Path |
|---|---|
| `control-zebra/config/` | `ControlZebra/config/` |
| `control-zebra/logs/` | `ControlZebra/logs/` |

Migration is one-time and logged. The old directories are removed after successful migration.

## Keychain Storage

The [[Other Services#AuthService|AuthService]] stores the Supabase session token in the OS keychain:

| Platform | Keychain |
|---|---|
| macOS | Keychain Access (via `go-keyring`) |
| Windows | Windows Credential Manager |

**Service name:** `ControlZebra`
**Key:** `supabase_session`

---

**Related:** [[Data Paths]] | [[SettingsService]] | [[RepositorySettingsService]] | [[Environment Variables]]
