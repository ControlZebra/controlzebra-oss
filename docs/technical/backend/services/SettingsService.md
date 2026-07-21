# SettingsService

> `services/settings_service.go` — ~354 lines. App-wide settings and git identity management.

## Overview

SettingsService handles app-level preferences (theme, recent folders) and git user identity configuration. Distinct from [[RepositorySettingsService]] which handles per-repo config.

## Constructor

```go
func NewSettingsService() *SettingsService {
    locations := GetDataLocationsSnapshot()
    return &SettingsService{
        runner:      NewCommandRunner(),
        settingsDir: locations.RoamingConfigDir,
        legacyDir:   locations.LegacyRoamingConfigDir,
    }
}
```

## App Settings

Stored at `<config>/settings.json`:

```go
type AppSettings struct {
    Theme                string   `json:"theme"`                // "dark", "light", "system"
    LastRepoPath         string   `json:"lastRepoPath"`
    RecentFolders        []string `json:"recentFolders"`        // Max 10, most recent first
    AutoDownloadUpdates  bool     `json:"autoDownloadUpdates"`
    DeveloperModeEnabled bool     `json:"developerModeEnabled"` // Enables internal developer tools
}
```

| Method | Purpose |
|--------|---------|
| `GetSettings()` | Load settings from disk |
| `SaveSettings(settings)` | Write settings to disk |
| `GetTheme()` | Current theme preference |
| `SetTheme(theme)` | Update theme |

## Recent Folders

| Method | Purpose |
|--------|---------|
| `GetRecentFolders()` | List of recently opened repo paths |
| `AddRecentFolder(path)` | Add/promote path to top of list |
| `RemoveRecentFolder(path)` | Remove path from recents |
| `ClearRecentFolders()` | Clear all recents |

Recent folders capped at 10 entries. Adding a folder that already exists promotes it to position 0.

## Git Identity

Manages git `user.name` and `user.email` configuration:

```go
type UserProfile struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}

type DetectedIdentity struct {
    Name        string `json:"name"`
    Email       string `json:"email"`
    NameSource  string `json:"nameSource"`   // "local", "global", "auto-set"
    EmailSource string `json:"emailSource"`
    WasAutoSet  bool   `json:"wasAutoSet"`
}
```

| Method | Purpose |
|--------|---------|
| `GetGitProfile(repoPath)` | Get local + global identity |
| `SetGitProfile(repoPath, profile)` | Set local repo identity |
| `SetGlobalGitProfile(profile)` | Set global git identity |
| `DetectIdentity(repoPath)` | Detect effective identity with source info |
| `EnsureIdentity(repoPath, name, email)` | Set identity if not already configured |

### Identity Priority

```
1. Local repo config (git config --local user.name)
2. Global config (git config --global user.name)
3. Fallback: auto-set from Supabase session data
```

`EnsureIdentity` only writes to **local** repo config — never modifies global settings.

### Parallel Config Reads

Identity detection reads local and global config in parallel:

```go
var wg sync.WaitGroup
wg.Add(2)
go func() { defer wg.Done(); localName = s.runner.RunGit(repoPath, "config", "--local", "user.name") }()
go func() { defer wg.Done(); globalName = s.runner.RunGit(repoPath, "config", "--global", "user.name") }()
wg.Wait()
```

---

**Related:** [[RepositorySettingsService]] (per-repo) | [[AuthService]] (Supabase session)
