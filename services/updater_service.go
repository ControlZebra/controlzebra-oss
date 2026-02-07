// Package services provides backend functionality for the ControlZebra application.
// This file contains the UpdaterService which manages auto-updates by spawning
// the cz-updater sidecar binary. The sidecar handles manifest fetching, binary
// downloading/verification, and binary replacement — all as a separate process
// with zero Wails dependency.
package services

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// UpdaterService exposes auto-update functionality to the frontend.
// It spawns the cz-updater sidecar binary for each operation and parses its
// JSON output. Progress events are forwarded to the frontend via Wails events.
type UpdaterService struct {
	app            *application.App
	currentVersion string
	updateURL      string
	publicKey      string // Base64-encoded Ed25519 public key for manifest signature verification
	sidecarPath    string
	mu             sync.Mutex
}

// UpdateInfo describes an available update. Returned by CheckForUpdate when a
// newer version exists on the update server.
type UpdateInfo struct {
	Version      string `json:"version"`
	ReleaseNotes string `json:"releaseNotes"`
	DownloadURL  string `json:"downloadURL"`
	Size         int64  `json:"size"`
	Checksum     string `json:"checksum"`
	ReleaseDate  string `json:"releaseDate"`
	Mandatory    bool   `json:"mandatory"`
}

// UpdateProgress is emitted as a Wails event ("updater:progress") during download.
type UpdateProgress struct {
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
}

// NewUpdaterService creates a new UpdaterService.
//   - version: the current app version (injected at build time via -ldflags)
//   - updateURL: base URL of the update manifest server (e.g. "https://releases.controlzebra.com/desktop/stable/")
//
// The update URL can be overridden at runtime by setting the CZ_UPDATE_URL
// environment variable. This is useful for local testing:
//
//	CZ_UPDATE_URL=http://localhost:8080/ task dev
func NewUpdaterService(version, updateURL string) *UpdaterService {
	if envURL := os.Getenv("CZ_UPDATE_URL"); envURL != "" {
		log.Printf("[UpdaterService] update URL overridden via CZ_UPDATE_URL: %s", envURL)
		updateURL = envURL
	}

	// Public key for manifest signature verification.
	// Can be overridden at runtime via CZ_SIGNING_PUBLIC_KEY env var (for testing).
	// In production, the key is compiled into the sidecar via -ldflags.
	publicKey := os.Getenv("CZ_SIGNING_PUBLIC_KEY")
	if publicKey != "" {
		log.Printf("[UpdaterService] manifest signature verification key overridden via CZ_SIGNING_PUBLIC_KEY")
	}

	return &UpdaterService{
		currentVersion: version,
		updateURL:      updateURL,
		publicKey:      publicKey,
	}
}

// SetApp sets the Wails application reference for event emission.
// Called after app initialization in main.go.
func (u *UpdaterService) SetApp(app *application.App) {
	u.app = app
	u.sidecarPath = u.resolveSidecarPath()
	log.Printf("[UpdaterService] sidecar path resolved: %s", u.sidecarPath)
}

// resolveSidecarPath finds the cz-updater binary relative to the main executable.
//
// Layout:
//   - macOS .app bundle: Contents/MacOS/control-zebra → Contents/MacOS/cz-updater
//   - Windows/Linux:     same directory as the main .exe
//   - Dev mode:          bin/cz-updater (fallback)
func (u *UpdaterService) resolveSidecarPath() string {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[UpdaterService] warning: os.Executable() failed: %v", err)
		return "cz-updater" // Fall back to PATH lookup
	}

	// Resolve symlinks — dev mode on macOS often uses symlinked .app bundles
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		log.Printf("[UpdaterService] warning: EvalSymlinks failed: %v", err)
	}

	dir := filepath.Dir(exe)
	name := "cz-updater"
	if runtime.GOOS == "windows" {
		name = "cz-updater.exe"
	}

	candidate := filepath.Join(dir, name)
	if _, err := os.Stat(candidate); err == nil {
		return candidate
	}

	// Dev fallback: try bin/ directory relative to working directory
	if wd, err := os.Getwd(); err == nil {
		devCandidate := filepath.Join(wd, "bin", name)
		if _, err := os.Stat(devCandidate); err == nil {
			log.Printf("[UpdaterService] using dev fallback sidecar: %s", devCandidate)
			return devCandidate
		}
	}

	// Last resort: rely on PATH
	log.Printf("[UpdaterService] warning: sidecar not found at %s, falling back to PATH", candidate)
	return name
}

// ──────────────────────────────────────────────────────────────────────────────
// Frontend-callable methods (auto-generate bindings via `task common:generate:bindings`)
// ──────────────────────────────────────────────────────────────────────────────

// GetCurrentVersion returns the app's compiled version string.
func (u *UpdaterService) GetCurrentVersion() string {
	return u.currentVersion
}

// CheckForUpdate spawns `cz-updater check` and returns update info.
// Returns nil with no error if the app is already up to date.
// Returns nil with an error if the check failed (network, parse, sidecar missing).
func (u *UpdaterService) CheckForUpdate() (*UpdateInfo, error) {
	u.mu.Lock()
	defer u.mu.Unlock()

	if err := u.verifySidecar(); err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	args := []string{
		"check",
		"--url", u.updateURL,
		"--current", u.currentVersion,
		"--os", runtime.GOOS,
		"--arch", runtime.GOARCH,
	}

	// Pass public key for manifest signature verification if available.
	// The sidecar also has a compiled-in key; this runtime override is for
	// testing or when the service holds a key the sidecar doesn't.
	if u.publicKey != "" {
		args = append(args, "--public-key", u.publicKey)
	}

	cmd := exec.CommandContext(ctx, u.sidecarPath, args...)

	output, err := cmd.Output()
	if err != nil {
		// Try to extract stderr for a better error message
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			return nil, fmt.Errorf("update check failed: %s", string(exitErr.Stderr))
		}
		return nil, fmt.Errorf("update check failed: %w", err)
	}

	var result struct {
		Available      bool   `json:"available"`
		Version        string `json:"version"`
		ReleaseNotes   string `json:"releaseNotes"`
		DownloadURL    string `json:"downloadURL"`
		Size           int64  `json:"size"`
		Checksum       string `json:"checksum"`
		ReleaseDate    string `json:"releaseDate"`
		Mandatory      bool   `json:"mandatory"`
		CurrentVersion string `json:"currentVersion"`
	}

	if err := json.Unmarshal(output, &result); err != nil {
		return nil, fmt.Errorf("invalid updater response: %w (raw: %s)", err, string(output))
	}

	if !result.Available {
		return nil, nil // Up to date
	}

	return &UpdateInfo{
		Version:      result.Version,
		ReleaseNotes: result.ReleaseNotes,
		DownloadURL:  result.DownloadURL,
		Size:         result.Size,
		Checksum:     result.Checksum,
		ReleaseDate:  result.ReleaseDate,
		Mandatory:    result.Mandatory,
	}, nil
}

// DownloadUpdate spawns `cz-updater download` with progress streaming.
// Emits "updater:progress" Wails events as download advances.
// Returns the path to the staged binary on success.
func (u *UpdaterService) DownloadUpdate(downloadURL, checksum string) (string, error) {
	u.mu.Lock()
	defer u.mu.Unlock()

	if err := u.verifySidecar(); err != nil {
		return "", err
	}

	if downloadURL == "" {
		return "", fmt.Errorf("download URL is required")
	}
	if checksum == "" {
		return "", fmt.Errorf("checksum is required")
	}

	cmd := exec.Command(u.sidecarPath,
		"download",
		"--url", downloadURL,
		"--checksum", checksum,
	)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	// Capture stderr for error reporting
	var stderrBuf []byte
	cmd.Stderr = nil // We'll read stderr from ExitError if needed

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start download: %w", err)
	}

	// Read JSON lines from stdout — progress lines and final result
	scanner := bufio.NewScanner(stdout)
	// Increase scanner buffer for potentially large JSON lines
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)

	var lastLine string
	for scanner.Scan() {
		line := scanner.Text()
		lastLine = line

		// Try to parse as progress event and forward to frontend
		var msg struct {
			Progress *UpdateProgress `json:"progress,omitempty"`
		}
		if json.Unmarshal([]byte(line), &msg) == nil && msg.Progress != nil {
			u.emitProgress(*msg.Progress)
		}
	}

	if scanErr := scanner.Err(); scanErr != nil {
		log.Printf("[UpdaterService] scanner error: %v", scanErr)
	}

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			stderrBuf = exitErr.Stderr
		}
		return "", fmt.Errorf("download process failed: %w (stderr: %s)", err, string(stderrBuf))
	}

	// Parse the final line as the download result
	if lastLine == "" {
		return "", fmt.Errorf("sidecar produced no output")
	}

	var result struct {
		Success bool   `json:"success"`
		Path    string `json:"path"`
		Error   string `json:"error"`
	}
	if err := json.Unmarshal([]byte(lastLine), &result); err != nil {
		return "", fmt.Errorf("invalid download result: %w (raw: %s)", err, lastLine)
	}

	if !result.Success {
		return "", fmt.Errorf("download failed: %s", result.Error)
	}

	return result.Path, nil
}

// ApplyUpdate spawns `cz-updater apply` as a detached process.
// The sidecar will wait for this app to exit, swap the binary, and relaunch.
// After calling this, the frontend should quit the app gracefully.
func (u *UpdaterService) ApplyUpdate(stagedPath string) error {
	if err := u.verifySidecar(); err != nil {
		return err
	}

	if stagedPath == "" {
		return fmt.Errorf("staged binary path is required")
	}

	// Verify staged file exists before we commit to applying
	if _, err := os.Stat(stagedPath); err != nil {
		return fmt.Errorf("staged binary not found at %s: %w", stagedPath, err)
	}

	exe, err := os.Executable()
	if err != nil {
		return fmt.Errorf("cannot determine current executable path: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return fmt.Errorf("cannot resolve executable symlinks: %w", err)
	}

	cmd := exec.Command(u.sidecarPath,
		"apply",
		"--staged", stagedPath,
		"--target", exe,
		"--pid", fmt.Sprintf("%d", os.Getpid()),
		"--launch",
	)

	// Detach the process so it survives after we exit.
	// Platform-specific: see updater_service_unix.go / updater_service_windows.go
	cmd.SysProcAttr = detachedProcessAttr()
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start updater apply: %w", err)
	}

	// Release the process handle so Go's runtime doesn't wait for it
	if err := cmd.Process.Release(); err != nil {
		log.Printf("[UpdaterService] warning: Process.Release failed: %v", err)
	}

	log.Printf("[UpdaterService] apply sidecar launched (PID %d), app should quit now", cmd.Process.Pid)
	return nil
}

// DownloadAndApply is a convenience method that downloads the update and
// immediately applies it. The frontend should quit the app after this returns.
func (u *UpdaterService) DownloadAndApply(downloadURL, checksum string) error {
	stagedPath, err := u.DownloadUpdate(downloadURL, checksum)
	if err != nil {
		return fmt.Errorf("download step failed: %w", err)
	}

	if err := u.ApplyUpdate(stagedPath); err != nil {
		return fmt.Errorf("apply step failed: %w", err)
	}

	return nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

// verifySidecar checks that the sidecar binary exists and is executable.
func (u *UpdaterService) verifySidecar() error {
	info, err := os.Stat(u.sidecarPath)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("updater sidecar not found at %s — was it included in the build?", u.sidecarPath)
		}
		return fmt.Errorf("cannot access updater sidecar at %s: %w", u.sidecarPath, err)
	}
	if info.IsDir() {
		return fmt.Errorf("updater sidecar path %s is a directory, not an executable", u.sidecarPath)
	}
	return nil
}

// emitProgress forwards a download progress update to the frontend via Wails events.
func (u *UpdaterService) emitProgress(p UpdateProgress) {
	if u.app != nil {
		u.app.Event.Emit("updater:progress", p)
	}
}
