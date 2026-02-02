// Package services provides backend functionality for the ControlZebra application.
// This file contains the FileWatcherService which watches directories for changes
// and emits events to the frontend for event-based UI refresh.
package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileWatcherService watches directories for file changes and emits events
type FileWatcherService struct {
	app     *application.App
	watcher *fsnotify.Watcher
	mu      sync.Mutex

	// Debounce settings to avoid flooding the frontend with events
	debounceDelay time.Duration
	pendingEvents map[string]time.Time
	debounceMu    sync.Mutex

	// Currently watched path
	watchedPath string
}

// FileChangeEvent represents a file change event sent to the frontend
type FileChangeEvent struct {
	Path      string `json:"path"`
	EventType string `json:"eventType"` // "create", "write", "remove", "rename"
	IsDir     bool   `json:"isDir"`
	Timestamp int64  `json:"timestamp"` // Unix milliseconds
}

// NewFileWatcherService creates a new FileWatcherService instance
func NewFileWatcherService() *FileWatcherService {
	return &FileWatcherService{
		debounceDelay: 500 * time.Millisecond, // Debounce events within 500ms
		pendingEvents: make(map[string]time.Time),
	}
}

// SetApp sets the Wails application reference for event emission
func (f *FileWatcherService) SetApp(app *application.App) {
	f.app = app
}

// WatchDirectory starts watching a directory for changes
// Returns an error if the directory cannot be watched
func (f *FileWatcherService) WatchDirectory(path string) OperationResult {
	f.mu.Lock()
	defer f.mu.Unlock()

	// Stop existing watcher if any
	if f.watcher != nil {
		f.watcher.Close()
		f.watcher = nil
		f.watchedPath = ""
	}

	// Validate path
	info, err := os.Stat(path)
	if err != nil {
		return OperationResult{
			Success: false,
			Error:   "Directory not found: " + path,
		}
	}
	if !info.IsDir() {
		return OperationResult{
			Success: false,
			Error:   "Path is not a directory: " + path,
		}
	}

	// Create new watcher
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return OperationResult{
			Success: false,
			Error:   "Failed to create file watcher: " + err.Error(),
		}
	}

	f.watcher = watcher
	f.watchedPath = path

	// Add the root directory and immediate subdirectories (non-recursive for performance)
	err = f.addWatchPath(path)
	if err != nil {
		f.watcher.Close()
		f.watcher = nil
		f.watchedPath = ""
		return OperationResult{
			Success: false,
			Error:   "Failed to watch directory: " + err.Error(),
		}
	}

	// Start the event loop
	go f.eventLoop()

	return OperationResult{
		Success: true,
		Message: "Watching directory: " + path,
	}
}

// addWatchPath adds a path and its immediate subdirectories to the watcher
func (f *FileWatcherService) addWatchPath(path string) error {
	// Add the root path
	err := f.watcher.Add(path)
	if err != nil {
		return err
	}

	// Add immediate subdirectories (one level deep for performance)
	entries, err := os.ReadDir(path)
	if err != nil {
		return nil // Non-fatal, continue with root only
	}

	for _, entry := range entries {
		if entry.IsDir() {
			name := entry.Name()
			// Skip hidden directories and common large directories
			if strings.HasPrefix(name, ".") || name == "node_modules" || name == "vendor" || name == "__pycache__" {
				continue
			}
			subPath := filepath.Join(path, name)
			_ = f.watcher.Add(subPath) // Ignore errors for subdirectories
		}
	}

	return nil
}

// StopWatching stops watching the current directory
func (f *FileWatcherService) StopWatching() OperationResult {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.watcher != nil {
		f.watcher.Close()
		f.watcher = nil
		f.watchedPath = ""
		return OperationResult{
			Success: true,
			Message: "Stopped watching",
		}
	}

	return OperationResult{
		Success: true,
		Message: "No active watcher",
	}
}

// GetWatchedPath returns the currently watched path
func (f *FileWatcherService) GetWatchedPath() string {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.watchedPath
}

// eventLoop processes file system events and emits them to the frontend
func (f *FileWatcherService) eventLoop() {
	for {
		select {
		case event, ok := <-f.watcher.Events:
			if !ok {
				return // Watcher closed
			}
			f.handleEvent(event)

		case err, ok := <-f.watcher.Errors:
			if !ok {
				return // Watcher closed
			}
			// Log error but continue watching
			if f.app != nil {
				f.app.Event.Emit("files-watcher-error", err.Error())
			}
		}
	}
}

// handleEvent processes a single file system event with debouncing
func (f *FileWatcherService) handleEvent(event fsnotify.Event) {
	// Determine event type
	var eventType string
	switch {
	case event.Op&fsnotify.Create != 0:
		eventType = "create"
	case event.Op&fsnotify.Write != 0:
		eventType = "write"
	case event.Op&fsnotify.Remove != 0:
		eventType = "remove"
	case event.Op&fsnotify.Rename != 0:
		eventType = "rename"
	case event.Op&fsnotify.Chmod != 0:
		return // Ignore chmod events
	default:
		return
	}

	// Skip temporary files and editor swap files
	name := filepath.Base(event.Name)
	if strings.HasPrefix(name, ".") && (strings.HasSuffix(name, ".swp") || strings.HasSuffix(name, ".swx")) {
		return
	}
	if strings.HasSuffix(name, "~") || strings.HasPrefix(name, "#") {
		return
	}

	// Debounce: skip if we've seen this path recently
	f.debounceMu.Lock()
	lastEvent, exists := f.pendingEvents[event.Name]
	now := time.Now()
	if exists && now.Sub(lastEvent) < f.debounceDelay {
		f.debounceMu.Unlock()
		return
	}
	f.pendingEvents[event.Name] = now
	f.debounceMu.Unlock()

	// Check if path is a directory
	isDir := false
	if info, err := os.Stat(event.Name); err == nil {
		isDir = info.IsDir()
	}

	// If a new directory was created, start watching it
	if eventType == "create" && isDir {
		name := filepath.Base(event.Name)
		if !strings.HasPrefix(name, ".") && name != "node_modules" && name != "vendor" {
			_ = f.watcher.Add(event.Name)
		}
	}

	// Emit event to frontend
	if f.app != nil {
		changeEvent := FileChangeEvent{
			Path:      event.Name,
			EventType: eventType,
			IsDir:     isDir,
			Timestamp: now.UnixMilli(),
		}
		f.app.Event.Emit("files-changed", changeEvent)
	}

	// Clean up old debounce entries periodically
	go f.cleanupDebounce()
}

// cleanupDebounce removes old entries from the debounce map
func (f *FileWatcherService) cleanupDebounce() {
	f.debounceMu.Lock()
	defer f.debounceMu.Unlock()

	cutoff := time.Now().Add(-5 * time.Second)
	for path, timestamp := range f.pendingEvents {
		if timestamp.Before(cutoff) {
			delete(f.pendingEvents, path)
		}
	}
}
