package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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

// ============================================================================
// v2 Tests - History, Diffs, Branches, Recovery
// ============================================================================

func TestGetGitVersion(t *testing.T) {
	svc := NewGitService()
	version, err := svc.GetGitVersion()

	if err != nil {
		t.Skipf("Git not available: %v", err)
	}

	if version.Major < 1 {
		t.Errorf("Expected git major version >= 1, got %d", version.Major)
	}

	t.Logf("Git version: %d.%d.%d", version.Major, version.Minor, version.Patch)
}

func TestSupportsRestore(t *testing.T) {
	svc := NewGitService()
	supportsRestore := svc.SupportsRestore()

	version, err := svc.GetGitVersion()
	if err != nil {
		t.Skipf("Git not available: %v", err)
	}

	expected := version.Major > 2 || (version.Major == 2 && version.Minor >= 23)
	if supportsRestore != expected {
		t.Errorf("SupportsRestore() = %v, expected %v for git %d.%d", supportsRestore, expected, version.Major, version.Minor)
	}
}

func TestShowCommit_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello world"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	commitResult := svc.CommitAll(repoPath, "Test commit")
	if !commitResult.Success {
		t.Fatalf("Failed to create commit: %s", commitResult.Error)
	}

	// Get the commit hash
	commits, err := svc.GetRecentCommits(repoPath, 1)
	if err != nil || len(commits) == 0 {
		t.Fatalf("Failed to get commits: %v", err)
	}

	// Show the commit
	detail := svc.ShowCommit(repoPath, commits[0].Hash)

	if detail.HasError {
		t.Errorf("Expected no error, got: %s", detail.Error)
	}
	if detail.Hash != commits[0].Hash {
		t.Errorf("Expected hash %s, got %s", commits[0].Hash, detail.Hash)
	}
	if detail.Message != "Test commit" {
		t.Errorf("Expected message 'Test commit', got '%s'", detail.Message)
	}
	if len(detail.Files) != 1 {
		t.Errorf("Expected 1 file changed, got %d", len(detail.Files))
	}
	if len(detail.Files) > 0 && detail.Files[0].Path != "test.txt" {
		t.Errorf("Expected file 'test.txt', got '%s'", detail.Files[0].Path)
	}
}

func TestShowCommit_InvalidHash(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	detail := svc.ShowCommit(repoPath, "invalid-hash-that-does-not-exist")

	if !detail.HasError {
		t.Error("Expected error for invalid hash")
	}
}

func TestShowCommit_EmptyHash(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	detail := svc.ShowCommit(repoPath, "")

	if !detail.HasError {
		t.Error("Expected error for empty hash")
	}
	if detail.Error != "Commit hash is required" {
		t.Errorf("Expected 'Commit hash is required', got '%s'", detail.Error)
	}
}

func TestDiffWorking_ModifiedFile(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("line1\nline2\nline3"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Modify the file
	if err := os.WriteFile(testFile, []byte("line1\nmodified line2\nline3"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	diff := svc.DiffWorking(repoPath, "test.txt")

	if diff.HasError {
		t.Errorf("Expected no error, got: %s", diff.Error)
	}
	if len(diff.Hunks) == 0 {
		t.Error("Expected at least one hunk")
	}
	if diff.Binary {
		t.Error("Expected non-binary file")
	}

	// Check that we have add and delete lines
	hasAdd := false
	hasDelete := false
	for _, hunk := range diff.Hunks {
		for _, line := range hunk.Lines {
			if line.Type == "add" {
				hasAdd = true
			}
			if line.Type == "delete" {
				hasDelete = true
			}
		}
	}

	if !hasAdd || !hasDelete {
		t.Error("Expected both add and delete lines in diff")
	}
}

func TestDiffWorking_UntrackedFile(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create an untracked file
	testFile := filepath.Join(repoPath, "new-file.txt")
	if err := os.WriteFile(testFile, []byte("new content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	diff := svc.DiffWorking(repoPath, "new-file.txt")

	if diff.HasError {
		t.Errorf("Expected no error, got: %s", diff.Error)
	}
	if diff.Status != "added" {
		t.Errorf("Expected status 'added', got '%s'", diff.Status)
	}
}

func TestDiffCommits_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "First commit")

	commits1, _ := svc.GetRecentCommits(repoPath, 1)
	firstHash := commits1[0].Hash

	// Modify and commit again
	if err := os.WriteFile(testFile, []byte("modified content"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.CommitAll(repoPath, "Second commit")

	commits2, _ := svc.GetRecentCommits(repoPath, 1)
	secondHash := commits2[0].Hash

	// Get diff between commits
	diff := svc.DiffCommits(repoPath, firstHash, secondHash, "test.txt")

	if diff.HasError {
		t.Errorf("Expected no error, got: %s", diff.Error)
	}
	if len(diff.Hunks) == 0 {
		t.Error("Expected at least one hunk")
	}
}

func TestDiffCommits_MissingHashes(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	diff := svc.DiffCommits(repoPath, "", "", "")
	if !diff.HasError {
		t.Error("Expected error for missing hashes")
	}
	if diff.Error != "Both commit hashes are required" {
		t.Errorf("Expected 'Both commit hashes are required', got '%s'", diff.Error)
	}
}

func TestBranches_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit (required for branches)
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	branches := svc.Branches(repoPath)

	if branches.HasError {
		t.Errorf("Expected no error, got: %s", branches.Error)
	}
	if len(branches.Local) == 0 {
		t.Error("Expected at least one local branch")
	}

	// Check current branch
	if branches.Current == "" {
		t.Error("Expected non-empty current branch")
	}

	// Find current branch in local list
	found := false
	for _, b := range branches.Local {
		if b.Name == branches.Current && b.IsCurrent {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected to find current branch in local branches")
	}
}

func TestCreateBranchAndCheckout_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create new branch
	result := svc.CreateBranchAndCheckout(repoPath, "feature-branch")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify we're on the new branch
	branches := svc.Branches(repoPath)
	if branches.Current != "feature-branch" {
		t.Errorf("Expected current branch 'feature-branch', got '%s'", branches.Current)
	}
}

func TestCreateBranchAndCheckout_WithUncommittedChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create uncommitted changes
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Try to create new branch
	result := svc.CreateBranchAndCheckout(repoPath, "feature-branch")

	if result.Success {
		t.Error("Expected failure when there are uncommitted changes")
	}
	if !strings.Contains(result.Error, "uncommitted changes") {
		t.Errorf("Expected error about uncommitted changes, got: %s", result.Error)
	}
}

func TestCreateBranchAndCheckout_EmptyName(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	result := svc.CreateBranchAndCheckout(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty branch name")
	}
	if result.Error != "Branch name is required" {
		t.Errorf("Expected 'Branch name is required', got '%s'", result.Error)
	}
}

func TestCreateBranchAndCheckout_InvalidName(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	result := svc.CreateBranchAndCheckout(repoPath, "invalid branch name")

	if result.Success {
		t.Error("Expected failure for invalid branch name")
	}
	if !strings.Contains(result.Error, "Invalid branch name") {
		t.Errorf("Expected error about invalid branch name, got: %s", result.Error)
	}
}

func TestCheckoutBranch_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create a new branch
	svc.CreateBranchAndCheckout(repoPath, "feature")

	// Switch back to main/master
	branches := svc.Branches(repoPath)
	mainBranch := "master"
	for _, b := range branches.Local {
		if b.Name == "main" {
			mainBranch = "main"
			break
		}
	}

	result := svc.CheckoutBranch(repoPath, mainBranch)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify we're on the original branch
	newBranches := svc.Branches(repoPath)
	if newBranches.Current != mainBranch {
		t.Errorf("Expected current branch '%s', got '%s'", mainBranch, newBranches.Current)
	}
}

func TestCheckoutBranch_WithUncommittedChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create a new branch via git directly
	runner := NewCommandRunner()
	runner.RunGit(repoPath, "branch", "feature")

	// Create uncommitted changes
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Try to checkout
	result := svc.CheckoutBranch(repoPath, "feature")

	if result.Success {
		t.Error("Expected failure when there are uncommitted changes")
	}
	if !strings.Contains(result.Error, "uncommitted changes") {
		t.Errorf("Expected error about uncommitted changes, got: %s", result.Error)
	}
}

func TestCheckoutBranch_NonExistent(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	result := svc.CheckoutBranch(repoPath, "non-existent-branch")

	if result.Success {
		t.Error("Expected failure for non-existent branch")
	}
	if !strings.Contains(result.Error, "does not exist") {
		t.Errorf("Expected error about branch not existing, got: %s", result.Error)
	}
}

func TestResetSoftHead_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create two commits
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("first"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "First commit")

	if err := os.WriteFile(testFile, []byte("second"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.CommitAll(repoPath, "Second commit")

	// Verify we have 2 commits
	commits, _ := svc.GetRecentCommits(repoPath, 10)
	if len(commits) != 2 {
		t.Fatalf("Expected 2 commits, got %d", len(commits))
	}

	// Reset with confirmation
	result := svc.ResetSoftHead(repoPath, 1, true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify we have 1 commit now
	newCommits, _ := svc.GetRecentCommits(repoPath, 10)
	if len(newCommits) != 1 {
		t.Errorf("Expected 1 commit after reset, got %d", len(newCommits))
	}

	// Verify changes are staged
	status := svc.Status(repoPath)
	if !status.HasChanges {
		t.Error("Expected staged changes after soft reset")
	}
}

func TestResetSoftHead_WithoutConfirmation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create a commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "First commit")

	// Try to reset without confirmation
	result := svc.ResetSoftHead(repoPath, 1, false)

	if result.Success {
		t.Error("Expected failure without confirmation")
	}
	if !strings.Contains(result.Error, "requires confirmation") {
		t.Errorf("Expected error about confirmation, got: %s", result.Error)
	}
}

func TestResetSoftHead_NotEnoughCommits(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create just one commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "First commit")

	// Try to reset 2 commits
	result := svc.ResetSoftHead(repoPath, 2, true)

	if result.Success {
		t.Error("Expected failure when not enough commits")
	}
	if !strings.Contains(result.Error, "Not enough commits") {
		t.Errorf("Expected error about not enough commits, got: %s", result.Error)
	}
}

func TestDiscardAll_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("original"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Modify the file and add an untracked file
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	newFile := filepath.Join(repoPath, "new.txt")
	if err := os.WriteFile(newFile, []byte("new content"), 0644); err != nil {
		t.Fatalf("Failed to create new file: %v", err)
	}

	// Verify changes exist
	status := svc.Status(repoPath)
	if !status.HasChanges {
		t.Fatal("Expected changes before discard")
	}

	// Discard all with confirmation
	result := svc.DiscardAll(repoPath, true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify no changes
	newStatus := svc.Status(repoPath)
	if newStatus.HasChanges {
		t.Errorf("Expected no changes after discard, got %d files", len(newStatus.ChangedFiles))
	}

	// Verify file content is restored
	content, _ := os.ReadFile(testFile)
	if string(content) != "original" {
		t.Errorf("Expected 'original', got '%s'", string(content))
	}
}

func TestDiscardAll_WithoutConfirmation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create changes
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Try to discard without confirmation
	result := svc.DiscardAll(repoPath, false)

	if result.Success {
		t.Error("Expected failure without confirmation")
	}
	if !strings.Contains(result.Error, "requires confirmation") {
		t.Errorf("Expected error about confirmation, got: %s", result.Error)
	}
}

func TestDiscardAll_NoChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Try to discard when there are no changes
	result := svc.DiscardAll(repoPath, true)

	if result.Success {
		t.Error("Expected failure when no changes to discard")
	}
	if !strings.Contains(result.Error, "No changes to discard") {
		t.Errorf("Expected error about no changes, got: %s", result.Error)
	}
}

func TestDiscardFile_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit files
	file1 := filepath.Join(repoPath, "file1.txt")
	file2 := filepath.Join(repoPath, "file2.txt")
	if err := os.WriteFile(file1, []byte("original1"), 0644); err != nil {
		t.Fatalf("Failed to create file1: %v", err)
	}
	if err := os.WriteFile(file2, []byte("original2"), 0644); err != nil {
		t.Fatalf("Failed to create file2: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Modify both files
	if err := os.WriteFile(file1, []byte("modified1"), 0644); err != nil {
		t.Fatalf("Failed to modify file1: %v", err)
	}
	if err := os.WriteFile(file2, []byte("modified2"), 0644); err != nil {
		t.Fatalf("Failed to modify file2: %v", err)
	}

	// Discard only file1
	result := svc.DiscardFile(repoPath, "file1.txt", true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify file1 is restored but file2 is still modified
	content1, _ := os.ReadFile(file1)
	content2, _ := os.ReadFile(file2)

	if string(content1) != "original1" {
		t.Errorf("Expected file1 to be 'original1', got '%s'", string(content1))
	}
	if string(content2) != "modified2" {
		t.Errorf("Expected file2 to still be 'modified2', got '%s'", string(content2))
	}
}

func TestDiscardFile_UntrackedFile(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create an untracked file
	untrackedFile := filepath.Join(repoPath, "untracked.txt")
	if err := os.WriteFile(untrackedFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create untracked file: %v", err)
	}

	// Discard (remove) the untracked file
	result := svc.DiscardFile(repoPath, "untracked.txt", true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify file is removed
	if _, err := os.Stat(untrackedFile); !os.IsNotExist(err) {
		t.Error("Expected untracked file to be removed")
	}
}

func TestDiscardFile_WithoutConfirmation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create a file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Try to discard without confirmation
	result := svc.DiscardFile(repoPath, "test.txt", false)

	if result.Success {
		t.Error("Expected failure without confirmation")
	}
	if !strings.Contains(result.Error, "requires confirmation") {
		t.Errorf("Expected error about confirmation, got: %s", result.Error)
	}
}

func TestDiffCommitFile_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Modify and commit
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.CommitAll(repoPath, "Second commit")

	// Get the latest commit hash
	commits, _ := svc.GetRecentCommits(repoPath, 1)
	hash := commits[0].Hash

	// Get diff for file in commit
	diff := svc.DiffCommitFile(repoPath, hash, "test.txt")

	if diff.HasError {
		t.Errorf("Expected no error, got: %s", diff.Error)
	}
	if len(diff.Hunks) == 0 {
		t.Error("Expected at least one hunk")
	}
}
