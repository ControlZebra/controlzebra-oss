# ControlZebra Data Policy

## Goal

Use one canonical storage layout so support, migration, and uninstall behavior are predictable.

## Data Classes

### 1) Roaming config (small, sync-safe)

- Windows: `%APPDATA%\ControlZebra\config`
- macOS: `~/Library/Application Support/ControlZebra/config`
- Linux: `~/.config/ControlZebra/config`

Contains:
- `settings.json`
- `repositories/*.json`

### 2) Local machine data (runtime-heavy)

- Windows: `%LOCALAPPDATA%\ControlZebra`
- macOS/Linux: user cache directory + `/ControlZebra`

Contains:
- `logs/`
- `cache/`
- `webview2/` (policy location)
- `tools/bin/` (portable toolchain)

### 3) Secrets

- Stored in OS credential/keychain APIs (no plaintext file storage)

### 4) Repository metadata

- `<repo>/.controlzebra/`
- Shared and local split remains unchanged in the repository layer.

## Migration Notes

At startup, backend migration performs a one-time layout transition:

- `%APPDATA%\control-zebra` → `%APPDATA%\ControlZebra\config`
- legacy debug logs (historical path) → local `logs/`
- legacy `%LOCALAPPDATA%\ControlZebra\bin` → `%LOCALAPPDATA%\ControlZebra\tools\bin`

A migration marker is written to:

- `<local data>/migrations/data-layout-v1.json`

## Diagnostics

Use backend `GetDataLocations()` to inspect resolved active and legacy paths.
