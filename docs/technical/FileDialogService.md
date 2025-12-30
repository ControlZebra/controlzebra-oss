# FileDialogService Documentation

## Overview

`FileDialogService` provides native file dialog operations for the Rewind Logic desktop app. It wraps Wails v3's dialog API to provide folder selection functionality.

## Architecture

```
FileDialogService
    └── Wails Application (app *application.App)
            └── Native Dialog API
```

**Note:** This service requires a reference to the Wails application instance, which must be set after app initialization using `SetApp()`.

## Methods

### NewFileDialogService() *FileDialogService

Creates a new FileDialogService instance. The app reference must be set separately.

### SetApp(app *application.App)

Sets the application reference required for dialog operations.

- **Input:** Wails application instance
- **When to call:** After `application.New()` returns, before using dialogs

### OpenFolderDialog() OpenFolderDialogResult

Opens a native folder picker dialog.

- **Output:** `OpenFolderDialogResult` containing:
  - `Path`: Selected folder path (empty if cancelled)
  - `Selected`: `true` if a folder was selected
  - `Error`: Error message if operation failed

**Dialog Features:**
- Can only select directories (not files)
- Can create new directories from the dialog
- Single selection only
- Title: "Select Repository Folder"

## Data Model

### OpenFolderDialogResult
```go
type OpenFolderDialogResult struct {
    Path     string `json:"path"`
    Selected bool   `json:"selected"`
    Error    string `json:"error,omitempty"`
}
```

## Usage Example

```go
// In main.go setup
fileDialogService := services.NewFileDialogService()

app := application.New(application.Options{
    // ... options
    Services: []application.Service{
        application.NewService(fileDialogService),
    },
})

// Set app reference after creation
fileDialogService.SetApp(app)

// Later, in a handler or service method
result := fileDialogService.OpenFolderDialog()
if result.Selected {
    fmt.Printf("User selected: %s\n", result.Path)
    // Process the selected folder
} else if result.Error != "" {
    log.Printf("Dialog error: %s", result.Error)
} else {
    fmt.Println("User cancelled the dialog")
}
```

## Frontend Integration

The service is typically triggered from the File menu or a UI button:

```go
// In main.go menu setup
fileMenu.Add("Open Folder...").
    SetAccelerator("CmdOrCtrl+O").
    OnClick(func(ctx *application.Context) {
        result := fileDialogService.OpenFolderDialog()
        if result.Selected && result.Path != "" {
            // Emit event to frontend
            app.Event.Emit("folder-selected", result.Path)
        }
    })
```

## Implementation Notes

- Requires Wails v3 application context
- Dialog blocks until user makes a selection or cancels
- Returns empty result (not error) when user cancels
- Uses Wails' platform-native dialog implementation
- The `CanCreateDirectories(true)` option allows users to create new folders
