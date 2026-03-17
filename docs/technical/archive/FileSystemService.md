# FileSystemService Documentation

## Overview

`FileSystemService` provides file system operations for the ControlZebra desktop app. It handles directory listing, file opening, and path manipulation with cross-platform support.

## Methods

### ListDirectory(path string) DirectoryContents

Lists the contents of a directory, sorted with directories first.

- **Input:** Absolute path to a directory
- **Output:** `DirectoryContents` struct containing:
  - `Path`: The listed directory path
  - `Entries`: Slice of `FileEntry` items
  - `Error`: Error message if operation failed

**Behavior:**
- Hidden files (starting with `.`) are excluded
- Directories are listed before files
- Entries are sorted alphabetically (case-insensitive)
- File sizes and extensions are populated for files
- Directories have size=0 and empty extension

### OpenFile(path string) OpenFileResult

Opens a file with the system's default application.

- **Input:** Absolute path to a file
- **Output:** `OpenFileResult` with success/error status

**Platform-specific behavior:**
- **macOS:** Uses `open` command
- **Linux:** Uses `xdg-open` command
- **Windows:** Uses `cmd /c start` command

### GetParentDirectory(path string) string

Returns the parent directory of the given path.

- **Input:** File or directory path
- **Output:** Parent directory path (or empty string for empty input)

## Data Models

### FileEntry
```go
type FileEntry struct {
    Name        string `json:"name"`        // File/directory name
    Path        string `json:"path"`        // Full absolute path
    IsDirectory bool   `json:"isDirectory"` // true if directory
    Size        int64  `json:"size"`        // File size in bytes (0 for dirs)
    Extension   string `json:"extension"`   // File extension without dot
}
```

### DirectoryContents
```go
type DirectoryContents struct {
    Path    string      `json:"path"`
    Entries []FileEntry `json:"entries"`
    Error   string      `json:"error,omitempty"`
}
```

### OpenFileResult
```go
type OpenFileResult struct {
    Success bool   `json:"success"`
    Error   string `json:"error,omitempty"`
}
```

## Usage Example

```go
svc := NewFileSystemService()

// List directory contents
contents := svc.ListDirectory("/path/to/project")
if contents.Error != "" {
    log.Printf("Error: %s", contents.Error)
    return
}

for _, entry := range contents.Entries {
    if entry.IsDirectory {
        fmt.Printf("[DIR] %s\n", entry.Name)
    } else {
        fmt.Printf("[FILE] %s (%d bytes, .%s)\n", 
            entry.Name, entry.Size, entry.Extension)
    }
}

// Open a file with default app
result := svc.OpenFile("/path/to/document.pdf")
if !result.Success {
    log.Printf("Failed to open: %s", result.Error)
}

// Navigate up
parent := svc.GetParentDirectory("/home/user/projects/app")
// parent = "/home/user/projects"
```

## Implementation Notes

- Uses Go's `os` package for file system operations
- Hidden files (Unix convention, starting with `.`) are filtered out
- File extensions are extracted without the leading dot
- Directory listing is non-recursive (single level)
- Sorting is case-insensitive using `strings.ToLower()`
- `OpenFile` uses `cmd.Start()` to not block on the opened application
