package services

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestNormalizeUpdateChannel(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"", "stable"},
		{"BETA", "stable"},
		{" stable ", "stable"},
	}

	for _, tt := range tests {
		if got := normalizeUpdateChannel(tt.input); got != tt.want {
			t.Fatalf("normalizeUpdateChannel(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}

func TestResolveManifestBaseURL(t *testing.T) {
	t.Setenv("CZ_UPDATE_URL", "")

	tests := []struct {
		channel string
		want    string
		wantErr bool
	}{
		{"", "https://controlzebra.github.io/controlzebra-releases/desktop/stable/", false},
		{"beta", "https://controlzebra.github.io/controlzebra-releases/desktop/stable/", false},
		{"stable", "https://controlzebra.github.io/controlzebra-releases/desktop/stable/", false},
		{"preview", "", true},
	}

	for _, tt := range tests {
		got, err := resolveManifestBaseURL(tt.channel)
		if (err != nil) != tt.wantErr {
			t.Fatalf("resolveManifestBaseURL(%q) error = %v, wantErr %v", tt.channel, err, tt.wantErr)
		}
		if err == nil && got != tt.want {
			t.Fatalf("resolveManifestBaseURL(%q) = %q, want %q", tt.channel, got, tt.want)
		}
	}
}

func TestResolveManifestBaseURLUsesEnvOverride(t *testing.T) {
	t.Setenv("CZ_UPDATE_URL", "http://localhost:8091/custom")

	got, err := resolveManifestBaseURL("stable")
	if err != nil {
		t.Fatalf("resolveManifestBaseURL returned error: %v", err)
	}
	if got != "http://localhost:8091/custom/" {
		t.Fatalf("resolveManifestBaseURL returned %q, want %q", got, "http://localhost:8091/custom/")
	}
}

func TestBuildApplyCommandArgs(t *testing.T) {
	t.Run("windows uses installer handoff", func(t *testing.T) {
		args, err := buildApplyCommandArgs("windows", "C:/tmp/control-zebra-installer.exe", "C:/tmp/cz-updater.log", 42, "C:/tmp/updater-state.json")
		if err != nil {
			t.Fatalf("buildApplyCommandArgs returned error: %v", err)
		}

		want := []string{"apply-windows-installer", "--installer", "C:/tmp/control-zebra-installer.exe", "--pid", "42", "--log", "C:/tmp/cz-updater.log", "--state-file", "C:/tmp/updater-state.json"}
		if len(args) != len(want) {
			t.Fatalf("buildApplyCommandArgs length = %d, want %d", len(args), len(want))
		}
		for index := range want {
			if args[index] != want[index] {
				t.Fatalf("buildApplyCommandArgs arg[%d] = %q, want %q", index, args[index], want[index])
			}
		}
	})

	t.Run("non-windows uses raw apply", func(t *testing.T) {
		tempDir := t.TempDir()
		args, err := buildApplyCommandArgs("darwin", filepath.Join(tempDir, "staged"), filepath.Join(tempDir, "cz-updater.log"), 7, filepath.Join(tempDir, "updater-state.json"))
		if err != nil {
			t.Fatalf("buildApplyCommandArgs returned error: %v", err)
		}
		if len(args) != 12 {
			t.Fatalf("buildApplyCommandArgs length = %d, want 12", len(args))
		}
		if args[0] != "apply" || args[1] != "--staged" || args[3] != "--target" || args[5] != "--pid" || args[7] != "--launch" || args[8] != "--log" || args[10] != "--state-file" {
			t.Fatalf("unexpected non-windows args: %v", args)
		}
	})
}

func TestFindReusableStagedArtifactClearsMismatch(t *testing.T) {
	service := newTestUpdateService(t)
	stagedPath := filepath.Join(t.TempDir(), "control-zebra.pkg")
	if err := os.WriteFile(stagedPath, []byte("payload"), 0o644); err != nil {
		t.Fatalf("failed to create staged file: %v", err)
	}

	if err := service.saveStagedArtifactState(StagedArtifactState{
		Channel:      "stable",
		Version:      "1.2.3",
		DownloadURL:  "https://example.com/control-zebra.pkg",
		Checksum:     "sha256:stale",
		StagedPath:   stagedPath,
		DownloadedAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		t.Fatalf("failed to save staged artifact state: %v", err)
	}

	_, ok, err := service.findReusableStagedArtifact("stable", UpdateCheckResult{
		Available:   true,
		Version:     "1.2.3",
		DownloadURL: "https://example.com/control-zebra.pkg",
		Checksum:    "sha256:fresh",
	})
	if err != nil {
		t.Fatalf("findReusableStagedArtifact returned error: %v", err)
	}
	if ok {
		t.Fatal("expected mismatched staged artifact record to be rejected")
	}
	if _, err := os.Stat(service.stateFilePath); !os.IsNotExist(err) {
		t.Fatalf("expected stale staged artifact state file to be cleared, stat err=%v", err)
	}
}

func TestCheckForUpdateStartsBackgroundDownloadWhenEnabled(t *testing.T) {
	service := newTestUpdateService(t)
	downloadCountPath := filepath.Join(t.TempDir(), "download-count.txt")
	stagedPath := filepath.Join(t.TempDir(), "staged", "control-zebra.pkg")
	service.sidecarPath = writeFakeUpdaterSidecar(t, stagedPath, downloadCountPath)

	result, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("CheckForUpdate returned error: %v", err)
	}
	if !result.Available {
		t.Fatal("expected fake sidecar to report an available update")
	}

	waitForCondition(t, func() bool {
		_, ok, err := service.findReusableStagedArtifact("stable", result)
		return err == nil && ok
	}, "background download to persist reusable staged artifact state")

	countData, err := os.ReadFile(downloadCountPath)
	if err != nil {
		t.Fatalf("failed to read download counter: %v", err)
	}
	if strings.TrimSpace(string(countData)) != "1" {
		t.Fatalf("expected exactly one background download, got %q", strings.TrimSpace(string(countData)))
	}
}

func TestCheckForUpdateSkipsBackgroundDownloadWhenDisabled(t *testing.T) {
	service := newTestUpdateService(t)
	downloadCountPath := filepath.Join(t.TempDir(), "download-count.txt")
	stagedPath := filepath.Join(t.TempDir(), "staged", "control-zebra.pkg")
	service.sidecarPath = writeFakeUpdaterSidecar(t, stagedPath, downloadCountPath)

	if err := service.settings.SaveAppSettings(AppSettings{Theme: "dark", AutoDownloadUpdates: false}); err != nil {
		t.Fatalf("failed to save disabled auto-download setting: %v", err)
	}

	result, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("CheckForUpdate returned error: %v", err)
	}
	if !result.Available {
		t.Fatal("expected fake sidecar to report an available update")
	}

	time.Sleep(200 * time.Millisecond)
	if _, err := os.Stat(downloadCountPath); !os.IsNotExist(err) {
		t.Fatalf("expected no background download when disabled, stat err=%v", err)
	}
	if _, err := os.Stat(service.stateFilePath); !os.IsNotExist(err) {
		t.Fatalf("expected no staged artifact state when auto-download is disabled, stat err=%v", err)
	}
}

func TestCheckForUpdateReturnsReadyToInstallWhenReusableArtifactExists(t *testing.T) {
	service := newTestUpdateService(t)
	downloadCountPath := filepath.Join(t.TempDir(), "download-count.txt")
	stagedPath := filepath.Join(t.TempDir(), "staged", "control-zebra.pkg")
	service.sidecarPath = writeFakeUpdaterSidecar(t, stagedPath, downloadCountPath)

	if err := os.MkdirAll(filepath.Dir(stagedPath), 0o755); err != nil {
		t.Fatalf("failed to create staged artifact directory: %v", err)
	}
	if err := os.WriteFile(stagedPath, []byte("hello"), 0o644); err != nil {
		t.Fatalf("failed to seed staged artifact: %v", err)
	}
	if err := service.saveStagedArtifactState(StagedArtifactState{
		Channel:      "stable",
		Version:      "1.2.3",
		DownloadURL:  "https://example.com/control-zebra.pkg",
		Checksum:     "sha256:test-checksum",
		StagedPath:   stagedPath,
		DownloadedAt: time.Now().UTC().Format(time.RFC3339),
	}); err != nil {
		t.Fatalf("failed to save staged artifact state: %v", err)
	}

	result, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("CheckForUpdate returned error: %v", err)
	}
	if !result.Available {
		t.Fatal("expected an available update")
	}
	if !result.ReadyToInstall {
		t.Fatal("expected reusable staged artifact to mark update as ready to install")
	}
	if _, err := os.Stat(downloadCountPath); !os.IsNotExist(err) {
		t.Fatalf("expected reusable artifact to avoid a fresh background download, stat err=%v", err)
	}
}

func TestCheckForUpdateRetriesFailedBackgroundDownloadOnLaterCheck(t *testing.T) {
	service := newTestUpdateService(t)
	downloadCountPath := filepath.Join(t.TempDir(), "download-count.txt")
	statePath := service.stateFilePath
	stagedPath := filepath.Join(t.TempDir(), "staged", "control-zebra.pkg")
	service.sidecarPath = writeRetryingFakeUpdaterSidecar(t, stagedPath, downloadCountPath)

	firstResult, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("first CheckForUpdate returned error: %v", err)
	}
	if !firstResult.Available {
		t.Fatal("expected fake sidecar to report an available update")
	}

	waitForCondition(t, func() bool {
		countData, err := os.ReadFile(downloadCountPath)
		return err == nil && strings.TrimSpace(string(countData)) == "1"
	}, "first failed background download attempt")

	if _, err := os.Stat(statePath); !os.IsNotExist(err) {
		t.Fatalf("expected failed background download to leave no reusable state, stat err=%v", err)
	}

	secondResult, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("second CheckForUpdate returned error: %v", err)
	}
	if !secondResult.Available {
		t.Fatal("expected fake sidecar to keep reporting an available update")
	}

	waitForCondition(t, func() bool {
		countData, err := os.ReadFile(downloadCountPath)
		if err != nil || strings.TrimSpace(string(countData)) != "2" {
			return false
		}
		_, ok, stateErr := service.findReusableStagedArtifact("stable", secondResult)
		return stateErr == nil && ok
	}, "successful retry background download on later check")

	refreshed, err := service.CheckForUpdate("stable")
	if err != nil {
		t.Fatalf("final CheckForUpdate returned error: %v", err)
	}
	if !refreshed.ReadyToInstall {
		t.Fatal("expected later checks to surface the retried staged artifact as ready to install")
	}
}

func newTestUpdateService(t *testing.T) *UpdateService {
	t.Helper()
	service := NewUpdateService("0.1.0")
	settingsDir := t.TempDir()
	service.settings.settingsDir = settingsDir
	service.settings.legacyDir = settingsDir
	service.stateFilePath = filepath.Join(t.TempDir(), "updater-state.json")
	return service
}

func writeFakeUpdaterSidecar(t *testing.T, stagedPath, downloadCountPath string) string {
	t.Helper()
	scriptPath := filepath.Join(t.TempDir(), "fake-updater")
	lineEnd := "\n"
	if runtime.GOOS == "windows" {
		t.Fatal("fake shell sidecar helper is only intended for non-Windows test runs")
	}
	script := fmt.Sprintf("#!/bin/sh%[1]sset -eu%[1]smode=\"$1\"%[1]sshift%[1]scase \"$mode\" in%[1]s  check)%[1]s    printf '%%s\\n' '{\"available\":true,\"version\":\"1.2.3\",\"downloadURL\":\"https://example.com/control-zebra.pkg\",\"checksum\":\"sha256:test-checksum\",\"size\":5,\"currentVersion\":\"0.1.0\"}'%[1]s    ;;%[1]s  download)%[1]s    if [ -n \"%[2]s\" ]; then%[1]s      count=0%[1]s      if [ -f \"%[2]s\" ]; then%[1]s        count=$(cat \"%[2]s\")%[1]s      fi%[1]s      count=$((count + 1))%[1]s      printf '%%s' \"$count\" > \"%[2]s\"%[1]s    fi%[1]s    mkdir -p \"$(dirname \"%[3]s\")\"%[1]s    printf 'hello' > \"%[3]s\"%[1]s    printf '%%s\\n' '{\"progress\":{\"downloaded\":5,\"total\":5,\"percent\":100}}'%[1]s    printf '{\"success\":true,\"path\":\"%%s\"}\\n' \"%[3]s\"%[1]s    ;;%[1]s  *)%[1]s    echo 'unsupported command' >&2%[1]s    exit 1%[1]s    ;;%[1]sesac%[1]s", lineEnd, downloadCountPath, stagedPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("failed to write fake updater sidecar: %v", err)
	}
	return scriptPath
}

func writeRetryingFakeUpdaterSidecar(t *testing.T, stagedPath, downloadCountPath string) string {
	t.Helper()
	scriptPath := filepath.Join(t.TempDir(), "fake-updater-retry")
	lineEnd := "\n"
	if runtime.GOOS == "windows" {
		t.Fatal("fake shell sidecar helper is only intended for non-Windows test runs")
	}
	script := fmt.Sprintf("#!/bin/sh%[1]sset -eu%[1]smode=\"$1\"%[1]sshift%[1]scase \"$mode\" in%[1]s  check)%[1]s    printf '%%s\\n' '{\"available\":true,\"version\":\"1.2.3\",\"downloadURL\":\"https://example.com/control-zebra.pkg\",\"checksum\":\"sha256:test-checksum\",\"size\":5,\"currentVersion\":\"0.1.0\"}'%[1]s    ;;%[1]s  download)%[1]s    count=0%[1]s    if [ -f \"%[2]s\" ]; then%[1]s      count=$(cat \"%[2]s\")%[1]s    fi%[1]s    count=$((count + 1))%[1]s    printf '%%s' \"$count\" > \"%[2]s\"%[1]s    if [ \"$count\" -eq 1 ]; then%[1]s      echo 'simulated background download failure' >&2%[1]s      exit 1%[1]s    fi%[1]s    mkdir -p \"$(dirname \"%[3]s\")\"%[1]s    printf 'hello' > \"%[3]s\"%[1]s    printf '%%s\\n' '{\"progress\":{\"downloaded\":5,\"total\":5,\"percent\":100}}'%[1]s    printf '{\"success\":true,\"path\":\"%%s\"}\\n' \"%[3]s\"%[1]s    ;;%[1]s  *)%[1]s    echo 'unsupported command' >&2%[1]s    exit 1%[1]s    ;;%[1]sesac%[1]s", lineEnd, downloadCountPath, stagedPath)
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		t.Fatalf("failed to write retrying fake updater sidecar: %v", err)
	}
	return scriptPath
}

func waitForCondition(t *testing.T, predicate func() bool, description string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		if predicate() {
			return
		}
		time.Sleep(25 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s", description)
}
