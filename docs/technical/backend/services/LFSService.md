# LFSService

> `services/lfs_service.go` — ~889 lines. Git Large File Storage operations.

## Overview

LFSService manages Git LFS (Large File Storage) for tracking large binary files common in industrial automation — images, PDFs, 3D models, and proprietary PLC files.

## Constructor

```go
func NewLFSService() *LFSService {
    return &LFSService{
        runner: NewCommandRunner(),
    }
}
```

## Key Methods

### LFS Status & Setup
| Method | Purpose |
|--------|---------|
| `IsLFSInstalled()` | Check if git-lfs CLI is available |
| `IsLFSInitialized(repoPath)` | Check if LFS is set up in this repo |
| `InitLFS(repoPath)` | Run `git lfs install` in repo |

### Track / Untrack Patterns
| Method | Git Command | Purpose |
|--------|------------|---------|
| `TrackPattern(repoPath, pattern)` | `git lfs track "<pattern>"` | Add LFS tracking pattern |
| `UntrackPattern(repoPath, pattern)` | `git lfs untrack "<pattern>"` | Remove LFS tracking pattern |
| `GetTrackedPatterns(repoPath)` | Parse `.gitattributes` | List all LFS-tracked patterns |
| `TrackPresetPatterns(repoPath, presetID)` | Multiple `git lfs track` calls | Apply preset pattern group |

### LFS Presets

Pre-defined pattern groups for common industrial file types:

| Preset ID | Name | Patterns |
|-----------|------|----------|
| `images` | Images | `*.png`, `*.jpg`, `*.jpeg`, `*.gif`, `*.bmp`, `*.tiff`, `*.webp`, `*.svg`, `*.ico` |
| `cad-3d` | CAD/3D Models | `*.stl`, `*.obj`, `*.step`, `*.stp`, `*.3mf`, `*.iges`, `*.fbx`, `*.blend` |
| `plc` | PLC/Industrial | `*.L5X`, `*.L5K`, `*.ACD`, `*.RSS`, `*.MER`, `*.AP*` |
| `documents` | Documents | `*.pdf`, `*.docx`, `*.xlsx`, `*.pptx` |
| `archives` | Archives | `*.zip`, `*.tar.gz`, `*.7z`, `*.rar` |

### Lock Management
| Method | Git Command | Purpose |
|--------|------------|---------|
| `LockFile(repoPath, path)` | `git lfs lock <path>` | Lock a file for exclusive editing |
| `UnlockFile(repoPath, path)` | `git lfs unlock <path>` | Release lock |
| `GetLocks(repoPath)` | `git lfs locks` | List all current locks |
| `GetLocksVerify(repoPath)` | `git lfs locks --verify` | Verify lock ownership |

### Fetch / Push / Prune
| Method | Git Command | Purpose |
|--------|------------|---------|
| `LFSFetch(repoPath)` | `git lfs fetch` | Download LFS objects |
| `LFSFetchRecent(repoPath)` | `git lfs fetch --recent` | Download recent LFS objects only |
| `LFSPull(repoPath)` | `git lfs pull` | Download + checkout LFS files |
| `LFSPush(repoPath)` | `git lfs push --all origin` | Upload LFS objects |
| `LFSPrune(repoPath)` | `git lfs prune` | Remove old local LFS objects |

### Large File Detection
| Method | Purpose |
|--------|---------|
| `DetectLargeFiles(repoPath, thresholdBytes)` | Scan for untracked files above size threshold |
| `GetLFSFileStatus(repoPath)` | Get LFS tracking status for all files |

## Auto-Track Flow

Before each "Save Changes" (commit), the frontend can intercept with the LFS auto-track modal:

```
User clicks "Save Changes"
  → useLfsAutoTrackBeforeSave hook
    → DetectLargeFiles(repoPath, threshold)
    → If large files found:
      → Show LFSAutoTrackModal
      → User selects patterns to track
      → TrackPattern() for each selected
    → Proceed with CommitAll()
```

See [[Explorer Feature]] for the frontend integration.

## Key Types

```go
type LFSPattern struct {
    Pattern   string `json:"pattern"`
    Filter    string `json:"filter"`     // "lfs"
    Diff      string `json:"diff"`
    Merge     string `json:"merge"`
}

type LFSLock struct {
    Path    string `json:"path"`
    Owner   string `json:"owner"`
    ID      string `json:"id"`
    LockedAt string `json:"lockedAt"`
}

type LFSPreset struct {
    ID       string   `json:"id"`
    Name     string   `json:"name"`
    Patterns []string `json:"patterns"`
    Category string   `json:"category"`
}

type LargeFileInfo struct {
    Path     string `json:"path"`
    Size     int64  `json:"size"`
    IsTracked bool  `json:"isTracked"`
}
```

---

**Related:** [[GitService]] | [[RepositorySettingsService]] (LFS background fetch task) | [[Explorer Feature]]
