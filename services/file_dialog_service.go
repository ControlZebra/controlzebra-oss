package services

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileDialogService provides file dialog operations
type FileDialogService struct {
	app *application.App
}

// NewFileDialogService creates a new FileDialogService
func NewFileDialogService() *FileDialogService {
	return &FileDialogService{}
}

// SetApp sets the application reference (called after app initialization)
func (f *FileDialogService) SetApp(app *application.App) {
	f.app = app
}

// OpenFolderDialogResult contains the result of an open folder dialog
type OpenFolderDialogResult struct {
	Path     string `json:"path"`
	Selected bool   `json:"selected"`
	Error    string `json:"error,omitempty"`
}

// OpenFolderDialog opens a native folder picker dialog
func (f *FileDialogService) OpenFolderDialog() OpenFolderDialogResult {
	if f.app == nil {
		return OpenFolderDialogResult{
			Selected: false,
			Error:    "Application not initialized",
		}
	}

	// Use OpenFile dialog configured for directory selection
	path, err := f.app.Dialog.OpenFile().
		SetTitle("Select Repository Folder").
		CanChooseDirectories(true).
		CanChooseFiles(false).
		CanCreateDirectories(true).
		PromptForSingleSelection()

	if err != nil {
		// User cancelled or error occurred
		return OpenFolderDialogResult{
			Selected: false,
		}
	}

	if path == "" {
		return OpenFolderDialogResult{
			Selected: false,
		}
	}

	return OpenFolderDialogResult{
		Path:     path,
		Selected: true,
	}
}
