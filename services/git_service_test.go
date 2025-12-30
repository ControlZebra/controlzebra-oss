package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"testing"
)

// createTestRepo creates a temporary git repository for testing
func createTestRepo(t *testing.T) string {
	t.Helper()

	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "rewind-logic-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	// Initialize git repo
	cmd := exec.Command("git", "init")
	cmd.Dir = tmpDir
	if err := cmd.Run(); err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("Failed to init git repo: %v", err)
	}

	// Configure git user for commits
	cmd = exec.Command("git", "config", "user.name", "Test User")
	cmd.Dir = tmpDir
	cmd.Run()

	cmd = exec.Command("git", "config", "user.email", "test@example.com")
	cmd.Dir = tmpDir
	cmd.Run()

	return tmpDir
}

// cleanupTestRepo removes a temporary test repository
func cleanupTestRepo(t *testing.T, path string) {
	t.Helper()
	os.RemoveAll(path)
}

func TestDetectRepo_ValidRepo(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.DetectRepo(repoPath)

	if !result.IsRepo {
		t.Errorf("Expected IsRepo to be true, got false")
	}
	if result.HasError {
		t.Errorf("Expected no error, got: %s", result.Error)
	}
	if result.Path != repoPath {
		t.Errorf("Expected path %s, got %s", repoPath, result.Path)
	}
}

func TestDetectRepo_NotARepo(t *testing.T) {
	// Create a regular directory (not a git repo)
	tmpDir, err := os.MkdirTemp("", "not-a-repo-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	svc := NewGitService()
	result := svc.DetectRepo(tmpDir)

	if result.IsRepo {
		t.Errorf("Expected IsRepo to be false for non-repo directory")
	}
}

func TestDetectRepo_NonExistentPath(t *testing.T) {
	svc := NewGitService()
	result := svc.DetectRepo("/nonexistent/path/that/does/not/exist")

	if result.IsRepo {
		t.Errorf("Expected IsRepo to be false for non-existent path")
	}
	if !result.HasError {
		t.Errorf("Expected HasError to be true")
	}
}

func TestStatus_EmptyRepo(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.Status(repoPath)

	if result.HasError {
		t.Errorf("Expected no error, got: %s", result.Error)
	}
	if result.HasChanges {
		t.Errorf("Expected no changes in empty repo")
	}
	if len(result.ChangedFiles) != 0 {
		t.Errorf("Expected 0 changed files, got %d", len(result.ChangedFiles))
	}
}

func TestStatus_WithChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	// Create a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	svc := NewGitService()
	result := svc.Status(repoPath)

	if result.HasError {
		t.Errorf("Expected no error, got: %s", result.Error)
	}
	if !result.HasChanges {
		t.Errorf("Expected HasChanges to be true")
	}
	if len(result.ChangedFiles) != 1 {
		t.Errorf("Expected 1 changed file, got %d", len(result.ChangedFiles))
	}
	if len(result.ChangedFiles) > 0 && result.ChangedFiles[0].Status != "untracked" {
		t.Errorf("Expected status 'untracked', got '%s'", result.ChangedFiles[0].Status)
	}
}

func TestCommitAll_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	// Create a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	svc := NewGitService()
	result := svc.CommitAll(repoPath, "Test commit message")

	if !result.Success {
		t.Errorf("Expected Success to be true, got error: %s", result.Error)
	}

	// Verify no more changes after commit
	status := svc.Status(repoPath)
	if status.HasChanges {
		t.Errorf("Expected no changes after commit")
	}
}

func TestCommitAll_NoChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.CommitAll(repoPath, "Test commit message")

	if result.Success {
		t.Errorf("Expected Success to be false when no changes")
	}
	if result.Error == "" {
		t.Errorf("Expected an error message")
	}
}

func TestCommitAll_EmptyMessage(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	// Create a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	svc := NewGitService()
	result := svc.CommitAll(repoPath, "")

	if result.Success {
		t.Errorf("Expected Success to be false with empty message")
	}
	if result.Error == "" {
		t.Errorf("Expected an error message for empty commit message")
	}
}

func TestGetRecentCommits_WithCommits(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	// Create and commit a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	svc := NewGitService()
	commitResult := svc.CommitAll(repoPath, "First commit")
	if !commitResult.Success {
		t.Fatalf("Failed to create commit: %s", commitResult.Error)
	}

	// Get commits
	commits, err := svc.GetRecentCommits(repoPath, 10)
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}
	if len(commits) != 1 {
		t.Errorf("Expected 1 commit, got %d", len(commits))
	}
	if len(commits) > 0 {
		if commits[0].Message != "First commit" {
			t.Errorf("Expected message 'First commit', got '%s'", commits[0].Message)
		}
		if commits[0].Hash == "" {
			t.Errorf("Expected non-empty hash")
		}
		if commits[0].ShortHash == "" {
			t.Errorf("Expected non-empty short hash")
		}
	}
}

func TestGetRecentCommits_EmptyRepo(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	commits, err := svc.GetRecentCommits(repoPath, 10)

	// Empty repo with no commits should return an error or empty list
	if err == nil && len(commits) > 0 {
		t.Errorf("Expected empty commits or error for repo with no commits")
	}
}

func TestPull_NoRemote(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.Pull(repoPath)

	// Pull without a remote should fail
	if result.Success {
		t.Errorf("Expected Pull to fail without a remote configured")
	}
}

func TestPush_NoRemote(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.Push(repoPath)

	// Push without a remote should fail
	if result.Success {
		t.Errorf("Expected Push to fail without a remote configured")
	}
}

func TestStatus_MultipleFileTypes(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	file1 := filepath.Join(repoPath, "file1.txt")
	if err := os.WriteFile(file1, []byte("initial content"), 0644); err != nil {
		t.Fatalf("Failed to create file1: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Modify committed file
	if err := os.WriteFile(file1, []byte("modified content"), 0644); err != nil {
		t.Fatalf("Failed to modify file1: %v", err)
	}

	// Add new untracked file
	file2 := filepath.Join(repoPath, "file2.txt")
	if err := os.WriteFile(file2, []byte("new file"), 0644); err != nil {
		t.Fatalf("Failed to create file2: %v", err)
	}

	status := svc.Status(repoPath)

	if !status.HasChanges {
		t.Errorf("Expected HasChanges to be true")
	}
	if len(status.ChangedFiles) != 2 {
		t.Errorf("Expected 2 changed files, got %d", len(status.ChangedFiles))
	}

	// Check we have both modified and untracked
	hasModified := false
	hasUntracked := false
	for _, f := range status.ChangedFiles {
		if f.Status == "modified" {
			hasModified = true
		}
		if f.Status == "untracked" {
			hasUntracked = true
		}
	}

	if !hasModified {
		t.Errorf("Expected a modified file")
	}
	if !hasUntracked {
		t.Errorf("Expected an untracked file")
	}
}
