# FileSystemService

> `services/filesystem_service.go` — ~734 lines. File operations, directory listing, and OS integration.

## Overview

FileSystemService provides file I/O operations that the frontend needs — reading file contents (text or base64-encoded binary), listing directories, opening files in the OS default app, and clipboard operations.

## Constructor

```go
func NewFileSystemService() *FileSystemService {
    return &FileSystemService{}
}
```

No `CommandRunner` needed — uses Go standard library directly.

## Key Methods

### Directory Operations
| Method | Purpose |
|--------|---------|
| `ListDirectory(path)` | List directory contents with file metadata |
| `ListDirectoryRecursive(path, maxDepth)` | Recursive listing with depth limit |
| `GetDirectorySize(path)` | Calculate total directory size |
| `CreateDirectory(path)` | Create directory (with parents) |

### File Reading
| Method | Purpose |
|--------|---------|
| `ReadTextFile(path)` | Read file as UTF-8 text |
| `ReadFileBase64(path)` | Read file as base64-encoded string (for binary files) |
| `GetFileInfo(path)` | File metadata (size, modified, permissions) |
| `FileExists(path)` | Check if path exists |
| `IsDirectory(path)` | Check if path is a directory |

### OS Integration
| Method | Purpose |
|--------|---------|
| `OpenFile(path)` | Open file in OS default application |
| `OpenURL(url)` | Open URL in default browser |
| `RevealInFinder(path)` | Show file in Finder/Explorer |
| `OpenInTerminal(path)` | Open terminal at path |
| `MoveToTrash(path)` | Move file to Trash/Recycle Bin |

### Clipboard
| Method | Purpose |
|--------|---------|
| `CopyToClipboard(text)` | Copy text to system clipboard |
| `ReadFromClipboard()` | Read text from system clipboard |

## Key Types

```go
type DirectoryEntry struct {
    Name       string `json:"name"`
    Path       string `json:"path"`
    IsDir      bool   `json:"isDir"`
    Size       int64  `json:"size"`
    ModifiedAt string `json:"modifiedAt"`
    Extension  string `json:"extension"`
}

type FileInfo struct {
    Name       string `json:"name"`
    Path       string `json:"path"`
    Size       int64  `json:"size"`
    IsDir      bool   `json:"isDir"`
    ModifiedAt string `json:"modifiedAt"`
    Permissions string `json:"permissions"`
}
```

## Usage Notes

- **Text vs Binary:** Use `ReadTextFile` for source code, config files. Use `ReadFileBase64` for images, PDFs, and binary files displayed in [[Viewer System|viewers]].
- **Path handling:** All paths should be absolute. The frontend gets repo root from [[GitService]] and constructs full paths.
- **Security:** File operations are sandboxed to user-accessible paths only. No symlink following outside the repo.

---

**Related:** [[FileDialogService]] | [[Viewer System]]
