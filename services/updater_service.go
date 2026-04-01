// Package services provides backend functionality for the ControlZebra application.
// This file contains the UpdateService which manages app updates by spawning the
// cz-updater sidecar binary. The sidecar handles manifest fetching, download
// verification, and platform-specific apply flows as a separate process with no
// Wails dependency.
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
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	defaultUpdateChannel  = "beta"
	defaultUpdateURLBase  = "https://controlzebra.github.io/controlzebra-releases/desktop"
	appUpdateEventName    = "app-update:progress"
	updaterStateFileName  = "updater-state.json"
	backgroundOperationID = "app-update-background"
)

var updateChannelBaseURLs = map[string]string{
	"beta":   defaultUpdateURLBase + "/beta/",
	"stable": defaultUpdateURLBase + "/stable/",
}

// UpdateService exposes app-update functionality to the frontend.
// It spawns the cz-updater sidecar binary for each operation and translates its
// JSON output into a stable Wails event contract for the UI.
type UpdateService struct {
	app            *application.App
	currentVersion string
	publicKey      string // Base64-encoded Ed25519 public key for manifest signature verification
	sidecarPath    string
	settings       *SettingsService
	stateFilePath  string
	mu             sync.Mutex
	inProgress     bool
	activeDownload *activeDownloadSession
}

// UpdateCheckResult is returned to the frontend after querying the release feed.
type UpdateCheckResult struct {
	Available      bool   `json:"available"`
	ReadyToInstall bool   `json:"readyToInstall,omitempty"`
	Version        string `json:"version,omitempty"`
	ReleaseNotes   string `json:"releaseNotes,omitempty"`
	DownloadURL    string `json:"downloadURL,omitempty"`
	Size           int64  `json:"size,omitempty"`
	Checksum       string `json:"checksum,omitempty"`
	ReleaseDate    string `json:"releaseDate,omitempty"`
	Mandatory      bool   `json:"mandatory,omitempty"`
	CurrentVersion string `json:"currentVersion,omitempty"`
}

// StartUpdateOptions controls which release channel to use.
type StartUpdateOptions struct {
	Channel string `json:"channel"`
}

// AppUpdateProgress is emitted as a Wails event during update operations.
type AppUpdateProgress struct {
	OperationID string `json:"operationId"`
	Phase       string `json:"phase"`
	Percent     int    `json:"percent"`
	Downloaded  int64  `json:"downloaded"`
	Total       int64  `json:"total"`
	Message     string `json:"message"`
	IsComplete  bool   `json:"isComplete"`
	Success     bool   `json:"success"`
	Error       string `json:"error,omitempty"`
}

type updaterState struct {
	StagedArtifact *StagedArtifactState `json:"stagedArtifact,omitempty"`
}

type StagedArtifactState struct {
	Channel      string `json:"channel"`
	Version      string `json:"version"`
	DownloadURL  string `json:"downloadURL"`
	Checksum     string `json:"checksum"`
	StagedPath   string `json:"stagedPath"`
	DownloadedAt string `json:"downloadedAt"`
}

type activeDownloadSession struct {
	channel     string
	version     string
	downloadURL string
	checksum    string
	background  bool
	watchers    map[string]struct{}
	done        chan struct{}
	downloaded  int64
	total       int64
	percent     int
	hasProgress bool
	stagedPath  string
	err         error
}

// NewUpdateService creates a new UpdateService.
func NewUpdateService(version string) *UpdateService {
	publicKey := strings.TrimSpace(os.Getenv("CZ_SIGNING_PUBLIC_KEY"))
	locations := GetDataLocationsSnapshot()
	stateFilePath := filepath.Join(locations.LocalDataDir, updaterStateFileName)
	if strings.TrimSpace(locations.LocalDataDir) == "" {
		stateFilePath = filepath.Join(os.TempDir(), updaterStateFileName)
	}

	// Public key for manifest signature verification.
	// Can be overridden at runtime via CZ_SIGNING_PUBLIC_KEY env var (for testing).
	// In production, the key is compiled into the sidecar via -ldflags.
	if publicKey != "" {
		log.Printf("[UpdateService] manifest signature verification key overridden via CZ_SIGNING_PUBLIC_KEY")
	}

	return &UpdateService{
		currentVersion: version,
		publicKey:      publicKey,
		settings:       NewSettingsService(),
		stateFilePath:  stateFilePath,
	}
}

// SetApp sets the Wails application reference for event emission.
// Called after app initialization in main.go.
func (u *UpdateService) SetApp(app *application.App) {
	u.app = app
	u.sidecarPath = u.resolveSidecarPath()
	log.Printf("[UpdateService] sidecar path resolved: %s", u.sidecarPath)
}

// resolveSidecarPath finds the cz-updater binary relative to the main executable.
//
// Layout:
//   - macOS .app bundle: Contents/MacOS/control-zebra → Contents/MacOS/cz-updater
//   - Windows/Linux:     same directory as the main .exe
//   - Dev mode:          bin/cz-updater (fallback)
func (u *UpdateService) resolveSidecarPath() string {
	exe, err := os.Executable()
	if err != nil {
		log.Printf("[UpdateService] warning: os.Executable() failed: %v", err)
		return "cz-updater" // Fall back to PATH lookup
	}

	// Resolve symlinks — dev mode on macOS often uses symlinked .app bundles
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		log.Printf("[UpdateService] warning: EvalSymlinks failed: %v", err)
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
			log.Printf("[UpdateService] using dev fallback sidecar: %s", devCandidate)
			return devCandidate
		}
	}

	// Last resort: rely on PATH
	log.Printf("[UpdateService] warning: sidecar not found at %s, falling back to PATH", candidate)
	return name
}

// ──────────────────────────────────────────────────────────────────────────────
// Frontend-callable methods (auto-generate bindings via `task common:generate:bindings`)
// ──────────────────────────────────────────────────────────────────────────────

// GetCurrentVersion returns the app's compiled version string.
func (u *UpdateService) GetCurrentVersion() string {
	return u.currentVersion
}

// CheckForUpdate spawns `cz-updater check` and returns a stable typed result.
func (u *UpdateService) CheckForUpdate(channel string) (UpdateCheckResult, error) {
	return u.checkForUpdate(channel, true)
}

func (u *UpdateService) checkForUpdate(channel string, allowAutoDownload bool) (UpdateCheckResult, error) {
	channel = normalizeUpdateChannel(channel)
	baseURL, err := resolveManifestBaseURL(channel)
	if err != nil {
		return UpdateCheckResult{}, err
	}

	if err := u.verifySidecar(); err != nil {
		return UpdateCheckResult{}, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	args := []string{
		"check",
		"--url", baseURL,
		"--current", u.currentVersion,
		"--os", runtime.GOOS,
		"--arch", runtime.GOARCH,
	}
	if u.publicKey != "" {
		args = append(args, "--public-key", u.publicKey)
	}

	cmd := exec.CommandContext(ctx, u.sidecarPath, args...)
	cmd.SysProcAttr = hideWindowAttr()
	cmd.Env = buildCommandEnv(u.sidecarPath)

	output, err := cmd.Output()
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			return UpdateCheckResult{}, fmt.Errorf("update check failed: %s", strings.TrimSpace(string(exitErr.Stderr)))
		}
		return UpdateCheckResult{}, fmt.Errorf("update check failed: %w", err)
	}

	var result UpdateCheckResult
	if err := json.Unmarshal(output, &result); err != nil {
		return UpdateCheckResult{}, fmt.Errorf("invalid updater response: %w (raw: %s)", err, string(output))
	}
	if result.CurrentVersion == "" {
		result.CurrentVersion = u.currentVersion
	}
	if !result.Available {
		if err := u.clearStagedArtifactState(); err != nil {
			log.Printf("[UpdateService] warning: failed to clear staged artifact state: %v", err)
		}
		return result, nil
	}
	if _, ok, err := u.findReusableStagedArtifact(channel, result); err == nil {
		result.ReadyToInstall = ok
	} else {
		log.Printf("[UpdateService] warning: failed to inspect reusable staged artifact before returning update check: %v", err)
	}
	if allowAutoDownload {
		u.startBackgroundDownloadIfNeeded(channel, result)
	}
	return result, nil
}

// StartUpdate checks, downloads, and hands off the update apply flow.
func (u *UpdateService) StartUpdate(options StartUpdateOptions) error {
	u.mu.Lock()
	if u.inProgress {
		u.mu.Unlock()
		return fmt.Errorf("an update is already in progress")
	}
	u.inProgress = true
	u.mu.Unlock()
	defer func() {
		u.mu.Lock()
		u.inProgress = false
		u.mu.Unlock()
	}()

	operationID := fmt.Sprintf("app-update-%d", time.Now().UnixNano())
	channel := normalizeUpdateChannel(options.Channel)

	u.emitProgress(AppUpdateProgress{
		OperationID: operationID,
		Phase:       "checking",
		Percent:     0,
		Message:     "Checking for updates...",
		Success:     true,
	})

	checkResult, err := u.checkForUpdate(channel, false)
	if err != nil {
		u.emitError(operationID, "checking", "Unable to check for updates.", err)
		return err
	}

	if !checkResult.Available {
		u.emitProgress(AppUpdateProgress{
			OperationID: operationID,
			Phase:       "done",
			Percent:     100,
			Message:     "ControlZebra is already up to date.",
			IsComplete:  true,
			Success:     true,
		})
		return nil
	}

	stagedPath, err := u.resolveStagedArtifact(operationID, channel, checkResult)
	if err != nil {
		u.emitError(operationID, "downloading", "Unable to download the update.", err)
		return err
	}

	u.emitProgress(AppUpdateProgress{
		OperationID: operationID,
		Phase:       "verifying",
		Percent:     100,
		Downloaded:  checkResult.Size,
		Total:       checkResult.Size,
		Message:     "Update package verified.",
		Success:     true,
	})

	if err := u.startApply(stagedPath); err != nil {
		u.emitError(operationID, "launching-installer", "Unable to start the installer handoff.", err)
		return err
	}

	u.emitProgress(AppUpdateProgress{
		OperationID: operationID,
		Phase:       "waiting-for-exit",
		Percent:     100,
		Message:     "Closing ControlZebra to finish the update...",
		Success:     true,
	})

	if u.app != nil {
		go func() {
			time.Sleep(150 * time.Millisecond)
			u.app.Quit()
		}()
	}

	return nil
}

func (u *UpdateService) startApply(stagedPath string) error {
	if err := u.verifySidecar(); err != nil {
		return err
	}
	if stagedPath == "" {
		return fmt.Errorf("staged update path is required")
	}
	if _, err := os.Stat(stagedPath); err != nil {
		return fmt.Errorf("staged update not found at %s: %w", stagedPath, err)
	}

	logPath := updateSidecarLogPath()
	args, err := buildApplyCommandArgs(runtime.GOOS, stagedPath, logPath, os.Getpid(), u.stateFilePath)
	if err != nil {
		return err
	}

	cmd := exec.Command(u.sidecarPath, args...)
	cmd.SysProcAttr = detachedProcessAttr()
	cmd.Stdout = nil
	cmd.Stderr = nil
	cmd.Stdin = nil
	cmd.Env = buildCommandEnv(u.sidecarPath)

	if err := cmd.Start(); err != nil {
		return fmt.Errorf("failed to start updater apply: %w", err)
	}
	if err := cmd.Process.Release(); err != nil {
		log.Printf("[UpdateService] warning: Process.Release failed: %v", err)
	}

	log.Printf("[UpdateService] apply sidecar launched (PID %d)", cmd.Process.Pid)
	return nil
}

func buildApplyCommandArgs(goos, stagedPath, logPath string, pid int, stateFilePath string) ([]string, error) {
	if goos == "windows" {
		args := []string{
			"apply-windows-installer",
			"--installer", stagedPath,
			"--pid", strconv.Itoa(pid),
			"--log", logPath,
		}
		if strings.TrimSpace(stateFilePath) != "" {
			args = append(args, "--state-file", stateFilePath)
		}
		return args, nil
	}

	exe, err := os.Executable()
	if err != nil {
		return nil, fmt.Errorf("cannot determine current executable path: %w", err)
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return nil, fmt.Errorf("cannot resolve executable symlinks: %w", err)
	}

	args := []string{
		"apply",
		"--staged", stagedPath,
		"--target", exe,
		"--pid", strconv.Itoa(pid),
		"--launch",
		"--log", logPath,
	}
	if strings.TrimSpace(stateFilePath) != "" {
		args = append(args, "--state-file", stateFilePath)
	}
	return args, nil
}

// ──────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────────

// verifySidecar checks that the sidecar binary exists and is executable.

func (u *UpdateService) verifySidecar() error {
	if u.sidecarPath == "" {
		u.sidecarPath = u.resolveSidecarPath()
	}
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

func (u *UpdateService) resolveStagedArtifact(operationID, channel string, checkResult UpdateCheckResult) (string, error) {
	stagedPath, ok, err := u.findReusableStagedArtifact(channel, checkResult)
	if err != nil {
		return "", err
	}
	if ok {
		return stagedPath, nil
	}

	session, started, err := u.getOrStartDownloadSession(channel, checkResult, operationID, false)
	if err != nil {
		return "", err
	}
	if session == nil {
		return "", fmt.Errorf("unable to start update download")
	}
	if started {
		go u.runDownloadSession(session)
	} else {
		u.emitDownloadSnapshot(operationID, session)
	}

	<-session.done
	if session.err != nil {
		return "", session.err
	}
	return session.stagedPath, nil
}

func (u *UpdateService) startBackgroundDownloadIfNeeded(channel string, checkResult UpdateCheckResult) {
	if !checkResult.Available || !u.isAutoDownloadEnabled() {
		return
	}
	if _, ok, err := u.findReusableStagedArtifact(channel, checkResult); err == nil && ok {
		return
	} else if err != nil {
		log.Printf("[UpdateService] warning: failed to inspect reusable staged artifact: %v", err)
	}

	session, started, err := u.getOrStartDownloadSession(channel, checkResult, backgroundOperationID, true)
	if err != nil {
		log.Printf("[UpdateService] warning: failed to start background download: %v", err)
		return
	}
	if session == nil || !started {
		return
	}
	go u.runDownloadSession(session)
}

func (u *UpdateService) getOrStartDownloadSession(channel string, checkResult UpdateCheckResult, operationID string, background bool) (*activeDownloadSession, bool, error) {
	if checkResult.DownloadURL == "" {
		return nil, false, fmt.Errorf("download URL is required")
	}
	if checkResult.Checksum == "" {
		return nil, false, fmt.Errorf("checksum is required")
	}

	u.mu.Lock()
	defer u.mu.Unlock()

	if active := u.activeDownload; active != nil {
		if active.matches(channel, checkResult) {
			if operationID != "" {
				active.watchers[operationID] = struct{}{}
			}
			return active, false, nil
		}
		if background {
			return nil, false, nil
		}
		return nil, false, fmt.Errorf("another update download is already in progress")
	}

	session := &activeDownloadSession{
		channel:     channel,
		version:     checkResult.Version,
		downloadURL: checkResult.DownloadURL,
		checksum:    checkResult.Checksum,
		background:  background,
		watchers:    map[string]struct{}{},
		done:        make(chan struct{}),
	}
	if operationID != "" {
		session.watchers[operationID] = struct{}{}
	}
	u.activeDownload = session
	return session, true, nil
}

func (s *activeDownloadSession) matches(channel string, checkResult UpdateCheckResult) bool {
	return s.channel == channel &&
		s.version == checkResult.Version &&
		s.downloadURL == checkResult.DownloadURL &&
		s.checksum == checkResult.Checksum
}

func (u *UpdateService) runDownloadSession(session *activeDownloadSession) {
	stagedPath, err := u.downloadUpdateArtifact(session.downloadURL, session.checksum, func(downloaded, total int64, percent float64) {
		u.emitDownloadProgress(session, downloaded, total, clampPercent(percent))
	})
	if err == nil {
		state := StagedArtifactState{
			Channel:      session.channel,
			Version:      session.version,
			DownloadURL:  session.downloadURL,
			Checksum:     session.checksum,
			StagedPath:   stagedPath,
			DownloadedAt: time.Now().UTC().Format(time.RFC3339),
		}
		if saveErr := u.saveStagedArtifactState(state); saveErr != nil {
			log.Printf("[UpdateService] warning: failed to persist staged artifact state: %v", saveErr)
		}
	}

	u.mu.Lock()
	if u.activeDownload == session {
		u.activeDownload = nil
	}
	session.stagedPath = stagedPath
	session.err = err
	background := session.background
	close(session.done)
	u.mu.Unlock()

	if background {
		if err != nil {
			log.Printf("[UpdateService] background update download failed: %v", err)
			return
		}
		u.emitProgress(AppUpdateProgress{
			OperationID: backgroundOperationID,
			Phase:       "done",
			Percent:     100,
			Message:     "Update ready to install.",
			IsComplete:  true,
			Success:     true,
		})
	}
}

func (u *UpdateService) emitDownloadProgress(session *activeDownloadSession, downloaded, total int64, percent int) {
	u.mu.Lock()
	session.downloaded = downloaded
	session.total = total
	session.percent = percent
	session.hasProgress = true
	watchers := make([]string, 0, len(session.watchers))
	for operationID := range session.watchers {
		watchers = append(watchers, operationID)
	}
	u.mu.Unlock()

	for _, operationID := range watchers {
		u.emitProgress(AppUpdateProgress{
			OperationID: operationID,
			Phase:       "downloading",
			Percent:     percent,
			Downloaded:  downloaded,
			Total:       total,
			Message:     "Downloading update package...",
			Success:     true,
		})
	}
}

func (u *UpdateService) emitDownloadSnapshot(operationID string, session *activeDownloadSession) {
	if operationID == "" {
		return
	}

	u.mu.Lock()
	if !session.hasProgress {
		u.mu.Unlock()
		return
	}
	downloaded := session.downloaded
	total := session.total
	percent := session.percent
	u.mu.Unlock()

	u.emitProgress(AppUpdateProgress{
		OperationID: operationID,
		Phase:       "downloading",
		Percent:     percent,
		Downloaded:  downloaded,
		Total:       total,
		Message:     "Downloading update package...",
		Success:     true,
	})
}

func (u *UpdateService) downloadUpdateArtifact(downloadURL, checksum string, onProgress func(downloaded, total int64, percent float64)) (string, error) {
	if err := u.verifySidecar(); err != nil {
		return "", err
	}
	if downloadURL == "" {
		return "", fmt.Errorf("download URL is required")
	}
	if checksum == "" {
		return "", fmt.Errorf("checksum is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, u.sidecarPath,
		"download",
		"--url", downloadURL,
		"--checksum", checksum,
	)
	cmd.SysProcAttr = hideWindowAttr()
	cmd.Env = buildCommandEnv(u.sidecarPath)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("failed to create stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("failed to start download: %w", err)
	}

	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 64*1024)

	var lastLine string
	for scanner.Scan() {
		line := scanner.Text()
		lastLine = line

		var msg struct {
			Progress *struct {
				Downloaded int64   `json:"downloaded"`
				Total      int64   `json:"total"`
				Percent    float64 `json:"percent"`
			} `json:"progress,omitempty"`
		}
		if json.Unmarshal([]byte(line), &msg) == nil && msg.Progress != nil {
			if onProgress != nil {
				onProgress(msg.Progress.Downloaded, msg.Progress.Total, msg.Progress.Percent)
			}
		}
	}

	if scanErr := scanner.Err(); scanErr != nil {
		log.Printf("[UpdateService] scanner error: %v", scanErr)
	}

	if err := cmd.Wait(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok && len(exitErr.Stderr) > 0 {
			return "", fmt.Errorf("download process failed: %s", strings.TrimSpace(string(exitErr.Stderr)))
		}
		return "", fmt.Errorf("download process failed: %w", err)
	}

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

func (u *UpdateService) findReusableStagedArtifact(channel string, checkResult UpdateCheckResult) (string, bool, error) {
	state, err := u.loadUpdaterState()
	if err != nil {
		return "", false, err
	}
	record := state.StagedArtifact
	if record == nil {
		return "", false, nil
	}
	if record.Channel != channel ||
		record.Version != checkResult.Version ||
		record.DownloadURL != checkResult.DownloadURL ||
		record.Checksum != checkResult.Checksum {
		if clearErr := u.clearStagedArtifactState(); clearErr != nil {
			log.Printf("[UpdateService] warning: failed to clear stale staged artifact state: %v", clearErr)
		}
		return "", false, nil
	}
	if strings.TrimSpace(record.StagedPath) == "" {
		if clearErr := u.clearStagedArtifactState(); clearErr != nil {
			log.Printf("[UpdateService] warning: failed to clear empty staged artifact state: %v", clearErr)
		}
		return "", false, nil
	}
	if _, err := os.Stat(record.StagedPath); err != nil {
		if clearErr := u.clearStagedArtifactState(); clearErr != nil {
			log.Printf("[UpdateService] warning: failed to clear missing staged artifact state: %v", clearErr)
		}
		return "", false, nil
	}
	return record.StagedPath, true, nil
}

func (u *UpdateService) loadUpdaterState() (updaterState, error) {
	path := strings.TrimSpace(u.stateFilePath)
	if path == "" {
		return updaterState{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return updaterState{}, nil
		}
		return updaterState{}, err
	}

	var state updaterState
	if err := json.Unmarshal(data, &state); err != nil {
		_ = os.Remove(path)
		return updaterState{}, nil
	}
	return state, nil
}

func (u *UpdateService) saveStagedArtifactState(state StagedArtifactState) error {
	path := strings.TrimSpace(u.stateFilePath)
	if path == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	payload, err := json.MarshalIndent(updaterState{StagedArtifact: &state}, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, payload, 0o644)
}

func (u *UpdateService) clearStagedArtifactState() error {
	path := strings.TrimSpace(u.stateFilePath)
	if path == "" {
		return nil
	}
	err := os.Remove(path)
	if err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func (u *UpdateService) isAutoDownloadEnabled() bool {
	if u.settings == nil {
		return true
	}
	return u.settings.GetAppSettings().AutoDownloadUpdates
}

func (u *UpdateService) emitProgress(p AppUpdateProgress) {
	if u.app != nil {
		u.app.Event.Emit(appUpdateEventName, p)
	}
}

func (u *UpdateService) emitError(operationID, phase, message string, err error) {
	wrapped := fmt.Sprintf("%s %v", message, err)
	log.Printf("[UpdateService] %s", wrapped)
	u.emitProgress(AppUpdateProgress{
		OperationID: operationID,
		Phase:       "error",
		Percent:     0,
		Message:     message,
		IsComplete:  true,
		Success:     false,
		Error:       err.Error(),
	})
	GetDebugLogger().Log(LogLevelError, LogCategoryError, "UpdateService", wrapped, LogDetails{Error: err.Error(), Method: phase}, -1)
}

func normalizeUpdateChannel(channel string) string {
	channel = strings.TrimSpace(strings.ToLower(channel))
	if channel == "" {
		return defaultUpdateChannel
	}
	return channel
}

func resolveManifestBaseURL(channel string) (string, error) {
	if envURL := strings.TrimSpace(os.Getenv("CZ_UPDATE_URL")); envURL != "" {
		return ensureTrailingSlash(envURL), nil
	}

	channel = normalizeUpdateChannel(channel)
	baseURL, ok := updateChannelBaseURLs[channel]
	if !ok {
		return "", fmt.Errorf("unsupported update channel %q", channel)
	}
	return ensureTrailingSlash(baseURL), nil
}

func ensureTrailingSlash(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return value
	}
	return strings.TrimRight(value, "/") + "/"
}

func updateSidecarLogPath() string {
	locations := GetDataLocationsSnapshot()
	if err := os.MkdirAll(locations.LogsDir, 0o700); err == nil {
		return filepath.Join(locations.LogsDir, "cz-updater.log")
	}
	return filepath.Join(os.TempDir(), "cz-updater.log")
}

func clampPercent(percent float64) int {
	if percent < 0 {
		return 0
	}
	if percent > 100 {
		return 100
	}
	return int(percent + 0.5)
}
