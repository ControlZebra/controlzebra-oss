# SettingsService Documentation

## Overview

`SettingsService` manages application preferences and Git user configuration. It persists app settings to a JSON file and interacts with Git config for user profile management.

## Architecture

```
SettingsService
    ├── App Settings (JSON file in user config directory)
    └── CommandRunner (for git config operations)
```

## Settings Storage

App settings follow the centralized data policy:
- **Roaming config root:**
    - **Windows:** `%APPDATA%\ControlZebra\config`
    - **macOS:** `~/Library/Application Support/ControlZebra/config`
    - **Linux:** `~/.config/ControlZebra/config`
- **Settings file:** `<roaming config root>/settings.json`
- **Per-repo app settings:** `<roaming config root>/repositories/*.json`

Runtime-heavy local machine data is kept outside roaming config:
- **Windows:** `%LOCALAPPDATA%\ControlZebra\...`
- **macOS/Linux:** user cache directory under `ControlZebra`

## Methods

### GetAppSettings() AppSettings

Retrieves the current application settings, returning defaults if no settings file exists.

- **Output:** `AppSettings` struct with current values
- **Defaults:**
  - `Theme`: "dark"
  - `LastRepoPath`: "" (empty)

### SaveAppSettings(settings AppSettings) error

Persists application settings to disk.

- **Input:** `AppSettings` struct with values to save
- **Output:** Error if save fails (e.g., permission denied)
- **Behavior:** Creates settings directory if it doesn't exist

### GetDataLocations() DataLocations

Returns resolved active + legacy data locations for diagnostics and support.

- **Output:** `DataLocations` containing app config, logs, cache, tools, and migration marker paths
- **Use case:** UI "where is my data" diagnostics and support triage

### GetUserProfile(repoPath string) UserProfile

Retrieves the Git user configuration (name and email).

- **Input:** Repository path (optional - uses global config if empty)
- **Output:** `UserProfile` with name and email
- **Behavior:** Returns local repo config if available, falls back to global

### SetUserProfile(repoPath string, profile UserProfile, global bool) OperationResult

Sets the Git user configuration.

- **Input:**
  - `repoPath`: Repository path (or empty for global)
  - `profile`: UserProfile with name and/or email
  - `global`: If `true`, sets `--global` config
- **Output:** `OperationResult` with success/error status
- **Behavior:** Only sets non-empty fields (partial updates supported)

## Data Models

### AppSettings
```go
type AppSettings struct {
    Theme        string `json:"theme"`        // "dark", "light", "system"
    LastRepoPath string `json:"lastRepoPath"` // Last opened repository path
}
```

### UserProfile
```go
type UserProfile struct {
    Name  string `json:"name"`
    Email string `json:"email"`
}
```

## Usage Example

```go
svc := NewSettingsService()

// Load app settings
settings := svc.GetAppSettings()
fmt.Printf("Theme: %s\n", settings.Theme)

// Save last opened repo
settings.LastRepoPath = "/path/to/my/project"
if err := svc.SaveAppSettings(settings); err != nil {
    log.Printf("Failed to save settings: %v", err)
}

// Get git user profile for a repo
profile := svc.GetUserProfile("/path/to/repo")
fmt.Printf("Git user: %s <%s>\n", profile.Name, profile.Email)

// Set global git user
result := svc.SetUserProfile("", UserProfile{
    Name:  "Jane Developer",
    Email: "jane@example.com",
}, true) // global = true
if !result.Success {
    log.Printf("Failed to set profile: %s", result.Error)
}
```

## Implementation Notes

- Settings file uses JSON format with indentation for readability
- Git config operations use `CommandRunner` with default 30s timeout
- Partial profile updates are supported (empty fields are skipped)
- File permissions: settings.json created with 0644, directory with 0755
