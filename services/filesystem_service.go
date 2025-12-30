package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

// FileSystemService provides file system operations
type FileSystemService struct{}

// NewFileSystemService creates a new FileSystemService
func NewFileSystemService() *FileSystemService {
	return &FileSystemService{}
}

// FileEntry represents a file or directory in the file system
type FileEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	IsDirectory bool   `json:"isDirectory"`
	Size        int64  `json:"size"`
	Extension   string `json:"extension"`
}

// DirectoryContents contains the contents of a directory
type DirectoryContents struct {
	Path    string      `json:"path"`
	Entries []FileEntry `json:"entries"`
	Error   string      `json:"error,omitempty"`
}

// ListDirectory lists the contents of a directory
func (f *FileSystemService) ListDirectory(path string) DirectoryContents {
	result := DirectoryContents{
		Path:    path,
		Entries: []FileEntry{},
	}

	// Handle empty path
	if path == "" {
		result.Error = "Path is required"
		return result
	}

	// Check if path exists
	info, err := os.Stat(path)
	if err != nil {
		result.Error = "Path does not exist"
		return result
	}

	if !info.IsDir() {
		result.Error = "Path is not a directory"
		return result
	}

	// Read directory entries
	entries, err := os.ReadDir(path)
	if err != nil {
		result.Error = "Failed to read directory: " + err.Error()
		return result
	}

	var dirs []FileEntry
	var files []FileEntry

	for _, entry := range entries {
		// Skip hidden files (starting with .)
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())
		fe := FileEntry{
			Name:        entry.Name(),
			Path:        fullPath,
			IsDirectory: entry.IsDir(),
		}

		if !entry.IsDir() {
			// Get file info for size
			if fileInfo, err := entry.Info(); err == nil {
				fe.Size = fileInfo.Size()
			}
			// Get extension
			fe.Extension = strings.TrimPrefix(filepath.Ext(entry.Name()), ".")
		}

		if entry.IsDir() {
			dirs = append(dirs, fe)
		} else {
			files = append(files, fe)
		}
	}

	// Sort directories and files alphabetically (case-insensitive)
	sort.Slice(dirs, func(i, j int) bool {
		return strings.ToLower(dirs[i].Name) < strings.ToLower(dirs[j].Name)
	})
	sort.Slice(files, func(i, j int) bool {
		return strings.ToLower(files[i].Name) < strings.ToLower(files[j].Name)
	})

	// Directories first, then files
	result.Entries = append(dirs, files...)

	return result
}

// OpenFileResult contains the result of opening a file
type OpenFileResult struct {
	Success bool   `json:"success"`
	Error   string `json:"error,omitempty"`
}

// OpenFile opens a file with the default application
func (f *FileSystemService) OpenFile(path string) OpenFileResult {
	if path == "" {
		return OpenFileResult{
			Success: false,
			Error:   "Path is required",
		}
	}

	// Check if file exists
	if _, err := os.Stat(path); err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "File does not exist",
		}
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: use 'open' command
		cmd = exec.Command("open", path)
	case "linux":
		// Linux: use 'xdg-open' command
		cmd = exec.Command("xdg-open", path)
	case "windows":
		// Windows: use 'cmd /c start' command
		cmd = exec.Command("cmd", "/c", "start", "", path)
	default:
		return OpenFileResult{
			Success: false,
			Error:   "Unsupported operating system",
		}
	}

	err := cmd.Start()
	if err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Failed to open file: " + err.Error(),
		}
	}

	return OpenFileResult{
		Success: true,
	}
}

// GetParentDirectory returns the parent directory of the given path
func (f *FileSystemService) GetParentDirectory(path string) string {
	if path == "" {
		return ""
	}
	return filepath.Dir(path)
}
