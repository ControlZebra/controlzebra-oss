package main

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCreateStagingDirReturnsUniqueManagedDirectories(t *testing.T) {
	baseDir := t.TempDir()

	first, err := createStagingDir(baseDir)
	if err != nil {
		t.Fatalf("createStagingDir first call failed: %v", err)
	}
	second, err := createStagingDir(baseDir)
	if err != nil {
		t.Fatalf("createStagingDir second call failed: %v", err)
	}

	if first == second {
		t.Fatalf("expected unique staging directories, got %q", first)
	}

	root := filepath.Join(baseDir, managedUpdatesParentDir, managedUpdatesDirName)
	for _, dir := range []string{first, second} {
		if filepath.Dir(dir) != root {
			t.Fatalf("staging directory %q not created under managed root %q", dir, root)
		}
		if !strings.HasPrefix(filepath.Base(dir), updateStagingDirPrefix) {
			t.Fatalf("staging directory %q does not use managed prefix %q", dir, updateStagingDirPrefix)
		}
	}
}

func TestCleanupStaleManagedStagingDirsRemovesOnlyOldManagedDirectories(t *testing.T) {
	baseDir := t.TempDir()
	root := filepath.Join(baseDir, managedUpdatesParentDir, managedUpdatesDirName)
	if err := os.MkdirAll(root, 0o755); err != nil {
		t.Fatalf("failed to create managed root: %v", err)
	}

	now := time.Now()
	oldDir := filepath.Join(root, updateStagingDirPrefix+"old")
	newDir := filepath.Join(root, updateStagingDirPrefix+"new")
	foreignDir := filepath.Join(root, "not-managed")
	for _, dir := range []string{oldDir, newDir, foreignDir} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("failed to create test directory %q: %v", dir, err)
		}
	}
	if err := os.Chtimes(oldDir, now.Add(-96*time.Hour), now.Add(-96*time.Hour)); err != nil {
		t.Fatalf("failed to age old staging dir: %v", err)
	}
	if err := os.Chtimes(newDir, now.Add(-24*time.Hour), now.Add(-24*time.Hour)); err != nil {
		t.Fatalf("failed to set new staging dir time: %v", err)
	}

	cleanupStaleManagedStagingDirs(root, now, 72*time.Hour)

	if _, err := os.Stat(oldDir); !os.IsNotExist(err) {
		t.Fatalf("expected old managed staging dir to be removed, stat err=%v", err)
	}
	if _, err := os.Stat(newDir); err != nil {
		t.Fatalf("expected new managed staging dir to remain: %v", err)
	}
	if _, err := os.Stat(foreignDir); err != nil {
		t.Fatalf("expected foreign directory to remain: %v", err)
	}
}

func TestDownloadWithProgressSequentialRetriesSucceedForSameAsset(t *testing.T) {
	payload := []byte("retry-safe-update-payload")
	checksum := sha256Hex(payload)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	baseDir := t.TempDir()
	firstDir, err := createStagingDir(baseDir)
	if err != nil {
		t.Fatalf("createStagingDir first call failed: %v", err)
	}
	secondDir, err := createStagingDir(baseDir)
	if err != nil {
		t.Fatalf("createStagingDir second call failed: %v", err)
	}

	firstPath, err := downloadWithProgress(server.URL+"/control-zebra.pkg", firstDir, checksum)
	if err != nil {
		t.Fatalf("first download failed: %v", err)
	}
	secondPath, err := downloadWithProgress(server.URL+"/control-zebra.pkg", secondDir, checksum)
	if err != nil {
		t.Fatalf("second download failed: %v", err)
	}

	if firstPath == secondPath {
		t.Fatalf("expected distinct staged paths, got %q", firstPath)
	}
	for _, path := range []string{firstPath, secondPath} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("failed to read staged artifact %q: %v", path, err)
		}
		if string(data) != string(payload) {
			t.Fatalf("staged artifact %q contents mismatch", path)
		}
	}
}

func TestDownloadWithProgressChecksumMismatchRemovesPartialFile(t *testing.T) {
	payload := []byte("bad-checksum-payload")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	stagingDir, err := createStagingDir(t.TempDir())
	if err != nil {
		t.Fatalf("createStagingDir failed: %v", err)
	}

	_, err = downloadWithProgress(server.URL+"/control-zebra.pkg", stagingDir, strings.Repeat("0", 64))
	if err == nil {
		t.Fatal("expected checksum mismatch error")
	}

	entries, err := os.ReadDir(stagingDir)
	if err != nil {
		t.Fatalf("failed to read staging directory: %v", err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected checksum mismatch to leave no staged files, found %d entries", len(entries))
	}
}

func sha256Hex(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

func TestDownloadWithProgressUsesFallbackNameWhenURLPathIsEmpty(t *testing.T) {
	payload := []byte("fallback-name")
	checksum := sha256Hex(payload)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write(payload)
	}))
	defer server.Close()

	stagingDir, err := createStagingDir(t.TempDir())
	if err != nil {
		t.Fatalf("createStagingDir failed: %v", err)
	}

	stagedPath, err := downloadWithProgress(server.URL, stagingDir, checksum)
	if err != nil {
		t.Fatalf("downloadWithProgress failed: %v", err)
	}
	if filepath.Base(stagedPath) != defaultDownloadAssetName {
		t.Fatalf("expected fallback filename %q, got %q", defaultDownloadAssetName, filepath.Base(stagedPath))
	}
	if _, err := os.Stat(stagedPath); err != nil {
		t.Fatalf("staged path %q missing: %v", stagedPath, err)
	}
}
