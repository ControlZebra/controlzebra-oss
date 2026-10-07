package services

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestControlZebraDirectoryHideFailure(t *testing.T) {
	hideErr := errors.New("attribute update denied")
	t.Run("empty directory is removed so a retry can hide it", func(t *testing.T) {
		dirPath := controlZebraDirPath(filepath.Join(t.TempDir(), "new", "project"))
		if err := createControlZebraDirectory(dirPath, func(string) error { return hideErr }); !errors.Is(err, hideErr) {
			t.Fatalf("expected attribute failure, got %v", err)
		}
		if _, err := os.Stat(dirPath); !os.IsNotExist(err) {
			t.Fatalf("failed creation left a directory behind: %v", err)
		}
		hidden := false
		if err := createControlZebraDirectory(dirPath, func(string) error {
			hidden = true
			return nil
		}); err != nil || !hidden {
			t.Fatalf("retry did not hide the newly created directory: hidden=%v, err=%v", hidden, err)
		}
		if err := createControlZebraDirectory(dirPath, func(string) error {
			t.Fatal("existing directory must not be hidden again")
			return nil
		}); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("contents added during failure are preserved", func(t *testing.T) {
		dirPath := controlZebraDirPath(t.TempDir())
		childPath := filepath.Join(dirPath, "keep.txt")
		err := createControlZebraDirectory(dirPath, func(string) error {
			if err := os.WriteFile(childPath, []byte("keep this content"), 0644); err != nil {
				t.Fatal(err)
			}
			return hideErr
		})
		if !errors.Is(err, hideErr) {
			t.Fatalf("expected attribute failure, got %v", err)
		}
		data, err := os.ReadFile(childPath)
		if err != nil || string(data) != "keep this content" {
			t.Fatalf("concurrent contents changed: %q, %v", data, err)
		}
	})
}

func TestRepositorySettingsServiceProjectConfig(t *testing.T) {
	repoPath := t.TempDir()
	service := &RepositorySettingsService{}
	ignorePath := filepath.Join(repoPath, ".gitignore")
	if err := os.WriteFile(ignorePath, []byte("existing-pattern\n"), 0644); err != nil {
		t.Fatal(err)
	}
	shared := RepoLocalConfig{CreatedAt: "2026-10-07", CreatedBy: "test-user", AppVersion: "test"}
	personal := RepoPersonalConfig{LocalOnlyMode: true}
	for _, result := range []OperationResult{
		service.WriteRepoLocalConfig(repoPath, shared),
		service.WriteRepoPersonalConfig(repoPath, personal),
		service.EnsureControlZebraDir(repoPath),
		service.EnsureControlZebraDir(repoPath),
	} {
		if !result.Success {
			t.Fatal(result.Error)
		}
	}
	if got := service.ReadRepoLocalConfig(repoPath); got != shared {
		t.Errorf("shared configuration changed: got %+v, want %+v", got, shared)
	}
	if got := service.ReadRepoPersonalConfig(repoPath); got != personal {
		t.Errorf("personal configuration changed: got %+v, want %+v", got, personal)
	}
	data, err := os.ReadFile(ignorePath)
	if err != nil {
		t.Fatal(err)
	}
	if got := string(data); got != "existing-pattern\n.controlzebra/local.json\n" {
		t.Errorf("ignore rules changed unexpectedly: %q", got)
	}
}

func TestRepositorySettingsServiceProjectDirectoryFailure(t *testing.T) {
	operations := []struct {
		name string
		run  func(*RepositorySettingsService, string) OperationResult
	}{
		{"ensure", (*RepositorySettingsService).EnsureControlZebraDir},
		{"shared_config", func(s *RepositorySettingsService, path string) OperationResult {
			return s.WriteRepoLocalConfig(path, RepoLocalConfig{})
		}},
		{"personal_config", func(s *RepositorySettingsService, path string) OperationResult {
			return s.WriteRepoPersonalConfig(path, RepoPersonalConfig{})
		}},
	}
	for _, operation := range operations {
		t.Run(operation.name, func(t *testing.T) {
			repoPath := t.TempDir()
			dirPath := controlZebraDirPath(repoPath)
			if err := os.WriteFile(dirPath, []byte("keep this file"), 0644); err != nil {
				t.Fatal(err)
			}
			result := operation.run(&RepositorySettingsService{}, repoPath)
			if result.Success || result.Error == "" {
				t.Fatalf("expected preparation failure, got %+v", result)
			}
			if strings.Contains(result.Error, repoPath) {
				t.Errorf("raw filesystem path leaked into user-facing error: %s", result.Error)
			}
			data, err := os.ReadFile(dirPath)
			if err != nil || string(data) != "keep this file" {
				t.Fatalf("blocking file changed: %q, %v", data, err)
			}
		})
	}
}
