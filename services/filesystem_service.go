package services

import (
	"encoding/base64"
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
	ModTime     int64  `json:"modTime"` // Unix timestamp in milliseconds
	IsHidden    bool   `json:"isHidden"`
}

// DirectoryContents contains the contents of a directory
type DirectoryContents struct {
	Path          string      `json:"path"`
	Entries       []FileEntry `json:"entries"`
	Error         string      `json:"error,omitempty"`
	IncludeHidden bool        `json:"includeHidden"`
}

// ListDirectory lists the contents of a directory (excludes hidden files by default)
func (f *FileSystemService) ListDirectory(path string) DirectoryContents {
	return f.ListDirectoryWithOptions(path, false)
}

// ListDirectoryWithOptions lists the contents of a directory with options
// includeHidden: if true, includes hidden files (starting with .)
func (f *FileSystemService) ListDirectoryWithOptions(path string, includeHidden bool) DirectoryContents {
	result := DirectoryContents{
		Path:          path,
		Entries:       []FileEntry{},
		IncludeHidden: includeHidden,
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
		isHidden := strings.HasPrefix(entry.Name(), ".")

		// Skip hidden files unless includeHidden is true
		if isHidden && !includeHidden {
			continue
		}

		fullPath := filepath.Join(path, entry.Name())
		fe := FileEntry{
			Name:        entry.Name(),
			Path:        fullPath,
			IsDirectory: entry.IsDir(),
			IsHidden:    isHidden,
		}

		// Get file info for size and mod time
		if fileInfo, err := entry.Info(); err == nil {
			fe.ModTime = fileInfo.ModTime().UnixMilli()
			if !entry.IsDir() {
				fe.Size = fileInfo.Size()
			}
		}

		if !entry.IsDir() {
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

// ReadTextFileResult contains the result of reading a text file
type ReadTextFileResult struct {
	Success bool   `json:"success"`
	Content string `json:"content,omitempty"`
	Error   string `json:"error,omitempty"`
}

// ReadTextFile reads the content of a text file
func (f *FileSystemService) ReadTextFile(path string) ReadTextFileResult {
	if path == "" {
		return ReadTextFileResult{
			Success: false,
			Error:   "Path is required",
		}
	}

	// Check if file exists
	info, err := os.Stat(path)
	if err != nil {
		return ReadTextFileResult{
			Success: false,
			Error:   "File does not exist",
		}
	}

	// Check if it's a directory
	if info.IsDir() {
		return ReadTextFileResult{
			Success: false,
			Error:   "Path is a directory, not a file",
		}
	}

	// Limit file size to 10MB to prevent memory issues
	const maxSize = 10 * 1024 * 1024
	if info.Size() > maxSize {
		return ReadTextFileResult{
			Success: false,
			Error:   "File is too large to display (max 10MB)",
		}
	}

	// Read file content
	content, err := os.ReadFile(path)
	if err != nil {
		return ReadTextFileResult{
			Success: false,
			Error:   "Failed to read file: " + err.Error(),
		}
	}

	return ReadTextFileResult{
		Success: true,
		Content: string(content),
	}
}

// ReadFileBase64Result contains the result of reading a file as base64
type ReadFileBase64Result struct {
	Success  bool   `json:"success"`
	Data     string `json:"data,omitempty"`     // Base64-encoded file content
	MimeType string `json:"mimeType,omitempty"` // MIME type based on extension
	Size     int64  `json:"size,omitempty"`     // File size in bytes
	Error    string `json:"error,omitempty"`
}

// mimeTypeFromExt returns the MIME type for common image extensions
func mimeTypeFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".gif":
		return "image/gif"
	case ".webp":
		return "image/webp"
	case ".bmp":
		return "image/bmp"
	case ".ico":
		return "image/x-icon"
	case ".svg":
		return "image/svg+xml"
	case ".tiff", ".tif":
		return "image/tiff"
	case ".avif":
		return "image/avif"
	case ".pdf":
		return "application/pdf"
	default:
		return "application/octet-stream"
	}
}

// ReadFileBase64 reads a file and returns its content as base64-encoded data.
// Useful for serving binary files (images, etc.) to the frontend webview
// where file:// URLs are not available.
// Limit: 50MB max file size.
func (f *FileSystemService) ReadFileBase64(path string) ReadFileBase64Result {
	if path == "" {
		return ReadFileBase64Result{
			Success: false,
			Error:   "Path is required",
		}
	}

	// Security: prevent directory traversal
	cleanPath := filepath.Clean(path)
	if strings.Contains(cleanPath, "..") {
		return ReadFileBase64Result{
			Success: false,
			Error:   "Invalid path",
		}
	}

	// Check if file exists
	info, err := os.Stat(cleanPath)
	if err != nil {
		return ReadFileBase64Result{
			Success: false,
			Error:   "File does not exist",
		}
	}

	if info.IsDir() {
		return ReadFileBase64Result{
			Success: false,
			Error:   "Path is a directory, not a file",
		}
	}

	// Limit file size to 50MB
	const maxSize = 50 * 1024 * 1024
	if info.Size() > maxSize {
		return ReadFileBase64Result{
			Success: false,
			Error:   "File is too large (max 50MB)",
		}
	}

	// Read file content
	content, err := os.ReadFile(cleanPath)
	if err != nil {
		return ReadFileBase64Result{
			Success: false,
			Error:   "Failed to read file: " + err.Error(),
		}
	}

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(content)

	// Determine MIME type from extension
	ext := filepath.Ext(cleanPath)
	mimeType := mimeTypeFromExt(ext)

	return ReadFileBase64Result{
		Success:  true,
		Data:     encoded,
		MimeType: mimeType,
		Size:     info.Size(),
	}
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

// OpenInTerminal opens a terminal at the specified path
func (f *FileSystemService) OpenInTerminal(path string) OpenFileResult {
	if path == "" {
		return OpenFileResult{
			Success: false,
			Error:   "Path is required",
		}
	}

	// Check if path exists and get the directory to open
	info, err := os.Stat(path)
	if err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Path does not exist",
		}
	}

	// If it's a file, use its parent directory
	targetDir := path
	if !info.IsDir() {
		targetDir = filepath.Dir(path)
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: open Terminal.app at the directory
		cmd = exec.Command("open", "-a", "Terminal", targetDir)
	case "linux":
		// Linux: try common terminal emulators
		// Try gnome-terminal, xterm, konsole in order
		terminals := []string{"gnome-terminal", "xterm", "konsole", "xfce4-terminal"}
		for _, term := range terminals {
			if _, err := exec.LookPath(term); err == nil {
				switch term {
				case "gnome-terminal":
					cmd = exec.Command(term, "--working-directory="+targetDir)
				case "xterm":
					cmd = exec.Command(term, "-e", "cd "+targetDir+" && $SHELL")
				default:
					cmd = exec.Command(term, "--workdir", targetDir)
				}
				break
			}
		}
		if cmd == nil {
			return OpenFileResult{
				Success: false,
				Error:   "No supported terminal emulator found",
			}
		}
	case "windows":
		// Windows: open cmd at the directory
		cmd = exec.Command("cmd", "/c", "start", "cmd", "/k", "cd /d "+targetDir)
	default:
		return OpenFileResult{
			Success: false,
			Error:   "Unsupported operating system",
		}
	}

	err = cmd.Start()
	if err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Failed to open terminal: " + err.Error(),
		}
	}

	return OpenFileResult{
		Success: true,
	}
}

// RevealInFinder opens the containing folder in the system file manager and selects the file
func (f *FileSystemService) RevealInFinder(path string) OpenFileResult {
	if path == "" {
		return OpenFileResult{
			Success: false,
			Error:   "Path is required",
		}
	}

	// Check if path exists
	if _, err := os.Stat(path); err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Path does not exist",
		}
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: use 'open -R' to reveal in Finder
		cmd = exec.Command("open", "-R", path)
	case "linux":
		// Linux: open the parent folder with xdg-open (can't select file)
		parentDir := filepath.Dir(path)
		cmd = exec.Command("xdg-open", parentDir)
	case "windows":
		// Windows: use 'explorer /select' to select the file
		cmd = exec.Command("explorer", "/select,"+path)
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
			Error:   "Failed to reveal in file manager: " + err.Error(),
		}
	}

	return OpenFileResult{
		Success: true,
	}
}

// OpenURL opens a URL in the system's default browser
func (f *FileSystemService) OpenURL(url string) OpenFileResult {
	if url == "" {
		return OpenFileResult{
			Success: false,
			Error:   "URL is required",
		}
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: use 'open' command
		cmd = exec.Command("open", url)
	case "linux":
		// Linux: use 'xdg-open' command
		cmd = exec.Command("xdg-open", url)
	case "windows":
		// Windows: use 'cmd /c start' command
		cmd = exec.Command("cmd", "/c", "start", "", url)
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
			Error:   "Failed to open URL: " + err.Error(),
		}
	}

	return OpenFileResult{
		Success: true,
	}
}

// CopyToClipboard copies the given text to the system clipboard
func (f *FileSystemService) CopyToClipboard(text string) OpenFileResult {
	if text == "" {
		return OpenFileResult{
			Success: false,
			Error:   "Text is required",
		}
	}

	var cmd *exec.Cmd

	switch runtime.GOOS {
	case "darwin":
		// macOS: use pbcopy
		cmd = exec.Command("pbcopy")
	case "linux":
		// Linux: try xclip or xsel
		if _, err := exec.LookPath("xclip"); err == nil {
			cmd = exec.Command("xclip", "-selection", "clipboard")
		} else if _, err := exec.LookPath("xsel"); err == nil {
			cmd = exec.Command("xsel", "--clipboard", "--input")
		} else {
			return OpenFileResult{
				Success: false,
				Error:   "No clipboard tool found (install xclip or xsel)",
			}
		}
	case "windows":
		// Windows: use clip command
		cmd = exec.Command("cmd", "/c", "echo|set /p="+text+"|clip")
		// For Windows, we can just run directly without stdin
		err := cmd.Run()
		if err != nil {
			return OpenFileResult{
				Success: false,
				Error:   "Failed to copy to clipboard: " + err.Error(),
			}
		}
		return OpenFileResult{
			Success: true,
		}
	default:
		return OpenFileResult{
			Success: false,
			Error:   "Unsupported operating system",
		}
	}

	// Set up stdin pipe for the command
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Failed to create pipe: " + err.Error(),
		}
	}

	if err := cmd.Start(); err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Failed to start clipboard command: " + err.Error(),
		}
	}

	// Write the text to stdin
	if _, err := stdin.Write([]byte(text)); err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Failed to write to clipboard: " + err.Error(),
		}
	}
	stdin.Close()

	if err := cmd.Wait(); err != nil {
		return OpenFileResult{
			Success: false,
			Error:   "Clipboard command failed: " + err.Error(),
		}
	}

	return OpenFileResult{
		Success: true,
	}
}
