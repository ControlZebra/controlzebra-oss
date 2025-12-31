// Package services provides backend functionality for the Rewind Logic application.
// This file contains the LFSService which wraps Git LFS CLI operations.
package services

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// LFSService provides Git LFS operations via CLI
type LFSService struct {
	runner       *CommandRunner
	lfsInstalled bool
	lfsCheckOnce sync.Once
}

// NewLFSService creates a new LFSService instance
func NewLFSService() *LFSService {
	return &LFSService{
		runner: NewCommandRunner(),
	}
}

// LFSInfo contains basic information about LFS status in a repo
type LFSInfo struct {
	Enabled  bool   `json:"enabled"`
	Version  string `json:"version,omitempty"`
	HasError bool   `json:"hasError"`
	Error    string `json:"error,omitempty"`
}

// IsLFSInstalled checks if git-lfs is installed on the system.
// Result is cached after the first check for efficiency.
func (l *LFSService) IsLFSInstalled() bool {
	l.lfsCheckOnce.Do(func() {
		result := l.runner.Run(".", "git", "lfs", "version")
		l.lfsInstalled = result.Success
	})
	return l.lfsInstalled
}

// GetLFSVersion returns the installed git-lfs version
func (l *LFSService) GetLFSVersion() (string, error) {
	result := l.runner.Run(".", "git", "lfs", "version")
	if !result.Success {
		return "", fmt.Errorf("git-lfs is not installed: %s", result.Error)
	}
	// Output format: "git-lfs/3.4.0 (GitHub; darwin amd64; go 1.21.0)"
	output := strings.TrimSpace(result.Stdout)
	if idx := strings.Index(output, " "); idx > 0 {
		return output[:idx], nil
	}
	return output, nil
}

// IsLFSEnabled checks if Git LFS is enabled for a repository
func (l *LFSService) IsLFSEnabled(repoPath string) LFSInfo {
	info := LFSInfo{}

	if !l.IsLFSInstalled() {
		info.HasError = true
		info.Error = "Git LFS is not installed"
		return info
	}

	// Check if .gitattributes contains LFS filters
	gitattributes := filepath.Join(repoPath, ".gitattributes")
	if _, err := os.Stat(gitattributes); os.IsNotExist(err) {
		// No .gitattributes means LFS is not configured
		info.Enabled = false
		return info
	}

	// Read .gitattributes and look for lfs filter
	data, err := os.ReadFile(gitattributes)
	if err != nil {
		info.HasError = true
		info.Error = "Failed to read .gitattributes: " + err.Error()
		return info
	}

	if strings.Contains(string(data), "filter=lfs") {
		info.Enabled = true
		version, _ := l.GetLFSVersion()
		info.Version = version
	}

	return info
}

// InitializeLFS initializes Git LFS for a repository
// This runs `git lfs install` in the repo context
func (l *LFSService) InitializeLFS(repoPath string) OperationResult {
	if !l.IsLFSInstalled() {
		return failedOp("Git LFS is not installed. Please install git-lfs first.")
	}

	result := l.runner.RunGit(repoPath, "lfs", "install")
	if !result.Success {
		return failedOp("Failed to initialize LFS: " + getErrorMessage(result))
	}

	return successOp("Git LFS initialized successfully")
}

// TrackedPattern represents a pattern tracked by Git LFS
type TrackedPattern struct {
	Pattern    string `json:"pattern"`
	Attributes string `json:"attributes,omitempty"` // e.g., "filter=lfs diff=lfs merge=lfs -text"
}

// GetTrackedPatterns returns the list of file patterns tracked by Git LFS
// Parses .gitattributes for entries with filter=lfs
func (l *LFSService) GetTrackedPatterns(repoPath string) ([]TrackedPattern, error) {
	patterns := []TrackedPattern{}

	gitattributes := filepath.Join(repoPath, ".gitattributes")
	file, err := os.Open(gitattributes)
	if os.IsNotExist(err) {
		return patterns, nil // No .gitattributes, no patterns
	}
	if err != nil {
		return nil, fmt.Errorf("failed to read .gitattributes: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Look for lines with filter=lfs
		if strings.Contains(line, "filter=lfs") {
			// Format: "*.ext filter=lfs diff=lfs merge=lfs -text"
			parts := strings.SplitN(line, " ", 2)
			if len(parts) >= 1 {
				pattern := TrackedPattern{
					Pattern: parts[0],
				}
				if len(parts) > 1 {
					pattern.Attributes = parts[1]
				}
				patterns = append(patterns, pattern)
			}
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("failed to parse .gitattributes: %w", err)
	}

	return patterns, nil
}

// TrackPattern adds a file pattern to be tracked by Git LFS
// Runs: git lfs track "<pattern>"
func (l *LFSService) TrackPattern(repoPath string, pattern string) OperationResult {
	if pattern == "" {
		return failedOp("Pattern is required")
	}

	if !l.IsLFSInstalled() {
		return failedOp("Git LFS is not installed")
	}

	result := l.runner.RunGit(repoPath, "lfs", "track", pattern)
	if !result.Success {
		return failedOp("Failed to track pattern: " + getErrorMessage(result))
	}

	return successOp(fmt.Sprintf("Now tracking '%s' with Git LFS", pattern))
}

// UntrackPattern removes a file pattern from Git LFS tracking
// Runs: git lfs untrack "<pattern>"
func (l *LFSService) UntrackPattern(repoPath string, pattern string) OperationResult {
	if pattern == "" {
		return failedOp("Pattern is required")
	}

	if !l.IsLFSInstalled() {
		return failedOp("Git LFS is not installed")
	}

	result := l.runner.RunGit(repoPath, "lfs", "untrack", pattern)
	if !result.Success {
		return failedOp("Failed to untrack pattern: " + getErrorMessage(result))
	}

	return successOp(fmt.Sprintf("Stopped tracking '%s' with Git LFS", pattern))
}

// PresetPattern represents a preset LFS tracking pattern
type PresetPattern struct {
	Pattern     string `json:"pattern"`
	Description string `json:"description"`
	Category    string `json:"category"` // e.g., "industrial", "media", "documents"
}

// presetPatterns is the static list of common LFS tracking patterns.
// Defined at package level to avoid allocation on each call.
var presetPatterns = []PresetPattern{
	// Rockwell / Allen-Bradley
	{Pattern: "*.acd", Description: "Studio 5000 Logix Designer project", Category: "industrial"},
	{Pattern: "*.L5X", Description: "Logix 5000 XML export", Category: "industrial"},
	{Pattern: "*.L5K", Description: "Logix 5000 text export", Category: "industrial"},
	{Pattern: "*.mer", Description: "FactoryTalk View ME runtime", Category: "industrial"},
	{Pattern: "*.apa", Description: "FactoryTalk View SE application", Category: "industrial"},

	// Siemens
	{Pattern: "*.ap*", Description: "TIA Portal project files", Category: "industrial"},
	{Pattern: "*.zap*", Description: "TIA Portal archived project", Category: "industrial"},

	// CODESYS / IEC 61131-3
	{Pattern: "*.project", Description: "CODESYS project", Category: "industrial"},
	{Pattern: "*.projectarchive", Description: "CODESYS project archive", Category: "industrial"},

	// Beckhoff
	{Pattern: "*.tsproj", Description: "TwinCAT project", Category: "industrial"},
	{Pattern: "*.tszip", Description: "TwinCAT project archive", Category: "industrial"},

	// B&R Automation
	{Pattern: "*.asprj", Description: "Automation Studio project", Category: "industrial"},

	// General automation
	{Pattern: "*.edb", Description: "Database files", Category: "industrial"},
	{Pattern: "*.mdb", Description: "Access database files", Category: "industrial"},

	// Common binary formats
	{Pattern: "*.zip", Description: "ZIP archives", Category: "archives"},
	{Pattern: "*.7z", Description: "7-Zip archives", Category: "archives"},
	{Pattern: "*.rar", Description: "RAR archives", Category: "archives"},
	{Pattern: "*.tar.gz", Description: "Compressed tarballs", Category: "archives"},

	// CAD/CAM
	{Pattern: "*.dwg", Description: "AutoCAD drawing", Category: "cad"},
	{Pattern: "*.dxf", Description: "AutoCAD exchange format", Category: "cad"},
	{Pattern: "*.step", Description: "STEP 3D model", Category: "cad"},
	{Pattern: "*.stl", Description: "STL 3D model", Category: "cad"},

	// Images
	{Pattern: "*.psd", Description: "Photoshop document", Category: "media"},
	{Pattern: "*.ai", Description: "Adobe Illustrator file", Category: "media"},
	{Pattern: "*.png", Description: "PNG images", Category: "media"},
	{Pattern: "*.jpg", Description: "JPEG images", Category: "media"},
	{Pattern: "*.bmp", Description: "Bitmap images", Category: "media"},

	// Documents
	{Pattern: "*.pdf", Description: "PDF documents", Category: "documents"},
	{Pattern: "*.docx", Description: "Word documents", Category: "documents"},
	{Pattern: "*.xlsx", Description: "Excel spreadsheets", Category: "documents"},
	{Pattern: "*.pptx", Description: "PowerPoint presentations", Category: "documents"},
}

// GetPresetPatterns returns common file patterns for industrial automation files
func (l *LFSService) GetPresetPatterns() []PresetPattern {
	return presetPatterns
}

// LFSFileStatus represents the LFS status of a file
type LFSFileStatus struct {
	Path     string `json:"path"`
	Status   string `json:"status"`   // "lfs" for LFS-tracked, "git" for regular
	Size     string `json:"size"`     // Human-readable size
	Uploaded bool   `json:"uploaded"` // True if file is uploaded to remote
}

// LFSStatus returns the status of LFS-tracked files in the working directory
func (l *LFSService) LFSStatus(repoPath string) ([]LFSFileStatus, error) {
	if !l.IsLFSInstalled() {
		return nil, fmt.Errorf("Git LFS is not installed")
	}

	result := l.runner.RunGit(repoPath, "lfs", "status", "--porcelain")
	if !result.Success {
		return nil, fmt.Errorf("failed to get LFS status: %s", getErrorMessage(result))
	}

	files := []LFSFileStatus{}
	lines := strings.Split(result.Stdout, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse LFS status output
		// Format varies by version, handle basic case
		parts := strings.Fields(line)
		if len(parts) >= 1 {
			file := LFSFileStatus{
				Path:   parts[len(parts)-1],
				Status: "lfs",
			}
			files = append(files, file)
		}
	}

	return files, nil
}

// LFSLock represents a locked file in Git LFS
type LFSLock struct {
	Path   string `json:"path"`
	Owner  string `json:"owner"`
	ID     string `json:"id"`
	Locked string `json:"locked"` // Timestamp
}

// LFSLocks returns the list of locked files in the repository
func (l *LFSService) LFSLocks(repoPath string) ([]LFSLock, error) {
	if !l.IsLFSInstalled() {
		return nil, fmt.Errorf("Git LFS is not installed")
	}

	result := l.runner.RunGit(repoPath, "lfs", "locks")
	if !result.Success {
		errMsg := getErrorMessage(result)
		// LFS locking requires server support; return empty if not available
		if strings.Contains(errMsg, "not enabled") || strings.Contains(errMsg, "not supported") {
			return []LFSLock{}, nil
		}
		return nil, fmt.Errorf("failed to get LFS locks: %s", errMsg)
	}

	locks := []LFSLock{}
	lines := strings.Split(result.Stdout, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Format: "path\towner\tID:123"
		// Or: "path\tID:123\towner"
		parts := strings.Split(line, "\t")
		if len(parts) >= 2 {
			lock := LFSLock{
				Path: parts[0],
			}
			for _, part := range parts[1:] {
				if strings.HasPrefix(part, "ID:") {
					lock.ID = strings.TrimPrefix(part, "ID:")
				} else {
					lock.Owner = part
				}
			}
			locks = append(locks, lock)
		}
	}

	return locks, nil
}

// LFSLock locks a file to prevent others from modifying it
func (l *LFSService) LFSLock(repoPath string, filePath string) OperationResult {
	if filePath == "" {
		return failedOp("File path is required")
	}

	if !l.IsLFSInstalled() {
		return failedOp("Git LFS is not installed")
	}

	result := l.runner.RunGit(repoPath, "lfs", "lock", filePath)
	if !result.Success {
		errMsg := getErrorMessage(result)
		if strings.Contains(errMsg, "already locked") {
			return failedOp("File is already locked by another user")
		}
		return failedOp("Failed to lock file: " + errMsg)
	}

	return successOp(fmt.Sprintf("Locked '%s'", filePath))
}

// LFSUnlock unlocks a file. If force is true, can unlock files locked by others.
func (l *LFSService) LFSUnlock(repoPath string, filePath string, force bool) OperationResult {
	if filePath == "" {
		return failedOp("File path is required")
	}

	if !l.IsLFSInstalled() {
		return failedOp("Git LFS is not installed")
	}

	args := []string{"lfs", "unlock", filePath}
	if force {
		args = append(args, "--force")
	}

	result := l.runner.RunGit(repoPath, args...)
	if !result.Success {
		errMsg := getErrorMessage(result)
		if strings.Contains(errMsg, "not locked") {
			return failedOp("File is not locked")
		}
		return failedOp("Failed to unlock file: " + errMsg)
	}

	return successOp(fmt.Sprintf("Unlocked '%s'", filePath))
}

// CheckLocksBeforeBranchSwitch checks for locked LFS files before switching branches.
// Returns a list of files that are locked by the current user.
func (l *LFSService) CheckLocksBeforeBranchSwitch(repoPath string) ([]LFSLock, error) {
	locks, err := l.LFSLocks(repoPath)
	if err != nil {
		return nil, err
	}

	// If no locks, return empty immediately
	if len(locks) == 0 {
		return locks, nil
	}

	// Get current user for filtering own locks
	userResult := l.runner.RunGit(repoPath, "config", "user.name")
	if !userResult.Success || strings.TrimSpace(userResult.Stdout) == "" {
		// Can't determine user - return all locks as a safety measure
		// The caller should warn the user about all locks
		return locks, nil
	}
	currentUser := strings.TrimSpace(userResult.Stdout)

	// Filter to only locks owned by current user
	ownLocks := make([]LFSLock, 0, len(locks))
	for _, lock := range locks {
		if lock.Owner == currentUser {
			ownLocks = append(ownLocks, lock)
		}
	}

	return ownLocks, nil
}
