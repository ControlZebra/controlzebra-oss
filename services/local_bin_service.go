package services

import (
	"archive/zip"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	// IMPORTANT: Use the regular (non-busybox) MinGit variant.
	// The busybox variant replaces standard shell utilities with BusyBox applets
	// which breaks credential helpers that use shell execution (e.g. `!gh auth git-credential`).
	// BusyBox's `sh` misinterprets `sh -c "..."` because `-c` is not a recognised applet,
	// producing the error: "-c: applet not found".
	defaultPortableGitURL = "https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/MinGit-2.48.1-64-bit.zip"
	defaultPortableGhURL  = "https://github.com/cli/cli/releases/download/v2.71.2/gh_2.71.2_windows_amd64.zip"
	defaultPortableLfsURL = "https://github.com/git-lfs/git-lfs/releases/download/v3.7.1/git-lfs-windows-amd64-v3.7.1.zip"
)

// LocalBinProgress is emitted to the frontend while portable tools are being prepared.
type LocalBinProgress struct {
	Component  string  `json:"component"`
	Phase      string  `json:"phase"`
	Message    string  `json:"message"`
	Downloaded int64   `json:"downloaded"`
	Total      int64   `json:"total"`
	Percent    float64 `json:"percent"`
	Success    bool    `json:"success"`
	Error      string  `json:"error,omitempty"`
}

// LocalBinStatus reports the current local portable tool availability.
type LocalBinStatus struct {
	BinRoot string `json:"binRoot"`

	GitPath string `json:"gitPath"`
	GhPath  string `json:"ghPath"`
	LfsPath string `json:"lfsPath"`

	HasGit bool `json:"hasGit"`
	HasGh  bool `json:"hasGh"`
	HasLfs bool `json:"hasLfs"`
}

// LocalBinService installs and manages user-level portable binaries.
// On Windows, binaries are installed under %LOCALAPPDATA%\ControlZebra\tools\bin.
type LocalBinService struct {
	app    *application.App
	client *http.Client
	mu     sync.Mutex
}

func NewLocalBinService() *LocalBinService {
	return &LocalBinService{
		client: &http.Client{Timeout: 30 * time.Minute},
	}
}

func (s *LocalBinService) SetApp(app *application.App) {
	s.app = app
}

func (s *LocalBinService) emitProgress(p LocalBinProgress) {
	if s.app != nil {
		s.app.Event.Emit("local-bin:progress", p)
	}
}

// GetStatus returns whether local managed binaries exist.
func (s *LocalBinService) GetStatus() LocalBinStatus {
	status := LocalBinStatus{
		BinRoot: LocalBinRootPath(),
	}

	for _, candidate := range localManagedGitPathCandidates() {
		if fileExists(candidate) {
			status.GitPath = candidate
			status.HasGit = true
			break
		}
	}

	for _, candidate := range localManagedGhPathCandidates() {
		if fileExists(candidate) {
			status.GhPath = candidate
			status.HasGh = true
			break
		}
	}

	for _, candidate := range localManagedLfsPathCandidates() {
		if fileExists(candidate) {
			status.LfsPath = candidate
			status.HasLfs = true
			break
		}
	}

	return status
}

// EnsurePortableToolchainIfNeeded installs missing portable tools for Windows.
// Also detects and replaces the BusyBox MinGit variant which breaks credential helpers.
func (s *LocalBinService) EnsurePortableToolchainIfNeeded() OperationResult {
	status := s.GetStatus()

	// Detect BusyBox MinGit and force replacement with the regular variant.
	// BusyBox's shell misinterprets `sh -c "..."` (the `-c` flag) as an applet
	// name, breaking credential helpers like `!gh auth git-credential`.
	if status.HasGit && isBusyBoxGit() {
		log.Println("[LocalBinService] BusyBox MinGit detected – replacing with regular MinGit for credential helper compatibility")
		gitDir := filepath.Join(LocalBinRootPath(), "git")
		_ = os.RemoveAll(gitDir)
		status.HasGit = false
	}

	if status.HasGit && status.HasGh && status.HasLfs {
		return successOp("Portable toolchain is ready")
	}
	return s.EnsurePortableToolchain()
}

// EnsurePortableToolchain installs portable Git, gh, and git-lfs in user-level storage.
func (s *LocalBinService) EnsurePortableToolchain() OperationResult {
	if runtime.GOOS != "windows" {
		return successOp("Portable toolchain manager is active on Windows only")
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	binRoot := LocalBinRootPath()
	if err := os.MkdirAll(binRoot, 0755); err != nil {
		return failedOp("Failed to create local bin directory: " + err.Error())
	}

	status := s.GetStatus()

	if !status.HasGit {
		s.emitProgress(LocalBinProgress{Component: "git", Phase: "starting", Message: "Preparing portable Git..."})
		if err := s.installPortableGit(); err != nil {
			s.emitProgress(LocalBinProgress{Component: "git", Phase: "error", Message: "Failed to prepare portable Git", Error: err.Error(), Success: false})
			return failedOp("Failed to prepare portable Git: " + err.Error())
		}
	}

	status = s.GetStatus()
	if !status.HasGh {
		s.emitProgress(LocalBinProgress{Component: "gh", Phase: "starting", Message: "Preparing GitHub CLI..."})
		if err := s.installPortableGh(); err != nil {
			s.emitProgress(LocalBinProgress{Component: "gh", Phase: "error", Message: "Failed to prepare GitHub CLI", Error: err.Error(), Success: false})
			return failedOp("Failed to prepare GitHub CLI: " + err.Error())
		}
	}

	status = s.GetStatus()
	if !status.HasLfs {
		s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "starting", Message: "Preparing Git LFS..."})
		if err := s.installPortableLFS(); err != nil {
			s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "error", Message: "Failed to prepare Git LFS", Error: err.Error(), Success: false})
			return failedOp("Failed to prepare Git LFS: " + err.Error())
		}
	}

	// Refresh cached resolver paths after installation.
	RefreshCLIPaths()

	if err := s.initializeLFSForPortableGit(); err != nil {
		s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "error", Message: "Failed to initialize Git LFS", Error: err.Error(), Success: false})
		return failedOp("Failed to initialize Git LFS: " + err.Error())
	}

	s.emitProgress(LocalBinProgress{Component: "toolchain", Phase: "done", Message: "Portable Git toolchain ready", Percent: 100, Success: true})
	return successOp("Portable Git toolchain ready")
}

func (s *LocalBinService) installPortableGit() error {
	zipPath, err := s.downloadToTemp("git", envOrDefault("CZ_PORTABLE_GIT_URL", defaultPortableGitURL), "Downloading Git")
	if err != nil {
		return err
	}
	defer os.Remove(zipPath)

	gitDir := filepath.Join(LocalBinRootPath(), "git")
	_ = os.RemoveAll(gitDir)
	if err := os.MkdirAll(gitDir, 0755); err != nil {
		return err
	}

	s.emitProgress(LocalBinProgress{Component: "git", Phase: "extracting", Message: "Extracting portable Git..."})
	if err := extractZipSecure(zipPath, gitDir); err != nil {
		return err
	}

	for _, candidate := range localManagedGitPathCandidates() {
		if fileExists(candidate) {
			s.emitProgress(LocalBinProgress{Component: "git", Phase: "done", Message: "Portable Git installed", Percent: 100, Success: true})
			return nil
		}
	}

	return fmt.Errorf("git executable not found after extraction")
}

func (s *LocalBinService) installPortableGh() error {
	zipPath, err := s.downloadToTemp("gh", envOrDefault("CZ_PORTABLE_GH_URL", defaultPortableGhURL), "Downloading GitHub CLI")
	if err != nil {
		return err
	}
	defer os.Remove(zipPath)

	target := filepath.Join(LocalBinRootPath(), "gh.exe")
	s.emitProgress(LocalBinProgress{Component: "gh", Phase: "extracting", Message: "Extracting GitHub CLI..."})
	if err := extractSingleFileFromZip(zipPath, target, "gh.exe", "bin/gh.exe"); err != nil {
		return err
	}

	s.emitProgress(LocalBinProgress{Component: "gh", Phase: "done", Message: "GitHub CLI installed", Percent: 100, Success: true})
	return nil
}

func (s *LocalBinService) installPortableLFS() error {
	zipPath, err := s.downloadToTemp("git-lfs", envOrDefault("CZ_PORTABLE_LFS_URL", defaultPortableLfsURL), "Downloading Git LFS")
	if err != nil {
		return err
	}
	defer os.Remove(zipPath)

	target := filepath.Join(LocalBinRootPath(), "git-lfs.exe")
	s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "extracting", Message: "Extracting Git LFS..."})
	if err := extractSingleFileFromZip(zipPath, target, "git-lfs.exe", "git-lfs.exe"); err != nil {
		return err
	}

	s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "done", Message: "Git LFS installed", Percent: 100, Success: true})
	return nil
}

func (s *LocalBinService) initializeLFSForPortableGit() error {
	gitExec := GitPath()
	if !filepath.IsAbs(gitExec) {
		return fmt.Errorf("portable git executable not available")
	}

	s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "initializing", Message: "Initializing Git LFS integration..."})

	cmd := exec.Command(gitExec, "lfs", "install", "--skip-repo")
	cmd.SysProcAttr = hideWindowAttr()
	cmd.Env = buildCommandEnv(gitExec)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("git lfs install --skip-repo failed: %s", strings.TrimSpace(string(output)))
	}

	s.emitProgress(LocalBinProgress{Component: "git-lfs", Phase: "initialized", Message: "Git LFS initialized", Percent: 100, Success: true})
	return nil
}

func (s *LocalBinService) downloadToTemp(component, downloadURL, label string) (string, error) {
	if strings.TrimSpace(downloadURL) == "" {
		return "", fmt.Errorf("download URL is empty")
	}

	tmpFile, err := os.CreateTemp("", "cz-portable-*.zip")
	if err != nil {
		return "", err
	}
	defer tmpFile.Close()

	if err := s.downloadToFile(component, downloadURL, label, tmpFile); err != nil {
		_ = os.Remove(tmpFile.Name())
		return "", err
	}

	return tmpFile.Name(), nil
}

func (s *LocalBinService) downloadToFile(component, downloadURL, label string, out *os.File) error {
	req, err := http.NewRequest(http.MethodGet, downloadURL, nil)
	if err != nil {
		return err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %s", resp.Status)
	}

	total := resp.ContentLength
	s.emitProgress(LocalBinProgress{Component: component, Phase: "downloading", Message: fmt.Sprintf("%s...", label), Downloaded: 0, Total: total, Percent: 0})

	buffer := make([]byte, 128*1024)
	var downloaded int64
	lastEmit := time.Now().Add(-1 * time.Second)

	for {
		n, readErr := resp.Body.Read(buffer)
		if n > 0 {
			if _, writeErr := out.Write(buffer[:n]); writeErr != nil {
				return writeErr
			}
			downloaded += int64(n)

			now := time.Now()
			if now.Sub(lastEmit) >= 250*time.Millisecond {
				s.emitProgress(LocalBinProgress{
					Component:  component,
					Phase:      "downloading",
					Message:    fmt.Sprintf("%s...", label),
					Downloaded: downloaded,
					Total:      total,
					Percent:    percent(downloaded, total),
				})
				lastEmit = now
			}
		}

		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}

	s.emitProgress(LocalBinProgress{Component: component, Phase: "downloaded", Message: fmt.Sprintf("%s complete", label), Downloaded: downloaded, Total: total, Percent: 100})
	return nil
}

func extractZipSecure(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	cleanDest := filepath.Clean(destDir)

	for _, f := range r.File {
		entryPath := filepath.Clean(filepath.Join(cleanDest, filepath.FromSlash(f.Name)))
		if entryPath != cleanDest && !strings.HasPrefix(entryPath, cleanDest+string(os.PathSeparator)) {
			return fmt.Errorf("zip entry escapes destination: %s", f.Name)
		}

		if f.FileInfo().IsDir() {
			if err := os.MkdirAll(entryPath, 0755); err != nil {
				return err
			}
			continue
		}

		if err := os.MkdirAll(filepath.Dir(entryPath), 0755); err != nil {
			return err
		}

		src, err := f.Open()
		if err != nil {
			return err
		}

		mode := f.Mode()
		if mode == 0 {
			mode = 0644
		}

		dst, err := os.OpenFile(entryPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			src.Close()
			return err
		}

		_, copyErr := io.Copy(dst, src)
		closeErr := dst.Close()
		srcErr := src.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if srcErr != nil {
			return srcErr
		}
	}

	return nil
}

func extractSingleFileFromZip(zipPath, targetPath, exeName, preferredSuffix string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()

	var preferred *zip.File
	var fallback *zip.File

	for i := range r.File {
		f := r.File[i]
		name := strings.ReplaceAll(f.Name, "\\", "/")
		if strings.EqualFold(filepath.Base(name), exeName) {
			if strings.HasSuffix(strings.ToLower(name), strings.ToLower(preferredSuffix)) {
				preferred = f
				break
			}
			if fallback == nil {
				fallback = f
			}
		}
	}

	chosen := preferred
	if chosen == nil {
		chosen = fallback
	}
	if chosen == nil {
		return fmt.Errorf("%s not found in archive", exeName)
	}

	src, err := chosen.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return err
	}

	dst, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
	if err != nil {
		return err
	}
	defer dst.Close()

	_, err = io.Copy(dst, src)
	return err
}

func percent(downloaded, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return float64(downloaded) * 100 / float64(total)
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir()
}

// isBusyBoxGit returns true if the managed portable Git directory contains a
// BusyBox-based MinGit installation. The BusyBox variant ships a busybox.exe
// in the mingw64/bin (or top-level) directory instead of individual MSYS2 utilities.
func isBusyBoxGit() bool {
	gitRoot := filepath.Join(LocalBinRootPath(), "git")
	candidates := []string{
		filepath.Join(gitRoot, "mingw64", "bin", "busybox.exe"),
		filepath.Join(gitRoot, "clangarm64", "bin", "busybox.exe"),
		filepath.Join(gitRoot, "bin", "busybox.exe"),
		filepath.Join(gitRoot, "usr", "bin", "busybox.exe"),
	}
	for _, p := range candidates {
		if fileExists(p) {
			return true
		}
	}

	// Also check: if usr/bin/sh.exe is missing, this is likely BusyBox MinGit
	// (the regular variant includes usr/bin/sh.exe as a proper MSYS2 shell).
	shPath := filepath.Join(gitRoot, "usr", "bin", "sh.exe")
	if !fileExists(shPath) {
		// Only flag as BusyBox if the git directory actually exists.
		if _, err := os.Stat(gitRoot); err == nil {
			return true
		}
	}

	return false
}

func envOrDefault(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
