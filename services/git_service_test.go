package services

import (
	"fmt"
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

// ============================================================================
// InitRepo Tests
// ============================================================================

func TestInitRepo_Success(t *testing.T) {
	// Create a temp directory but don't init git
	tmpDir, err := os.MkdirTemp("", "init-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	targetPath := filepath.Join(tmpDir, "new-repo")

	svc := NewGitService()
	result := svc.InitRepo(targetPath)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify it's actually a git repo now
	info := svc.DetectRepo(targetPath)
	if !info.IsRepo {
		t.Error("Expected directory to be a valid git repo after init")
	}
}

func TestInitRepo_AlreadyExists(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	result := svc.InitRepo(repoPath)

	if result.Success {
		t.Error("Expected failure when initializing existing repo")
	}
	if !strings.Contains(result.Error, "already a Git repository") {
		t.Errorf("Expected 'already a Git repository' error, got: %s", result.Error)
	}
}

func TestInitRepo_EmptyPath(t *testing.T) {
	svc := NewGitService()
	result := svc.InitRepo("")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
	if !strings.Contains(result.Error, "Path is required") {
		t.Errorf("Expected 'Path is required' error, got: %s", result.Error)
	}
}

func TestInitRepoWithLFS_Success(t *testing.T) {
	lfsSvc := NewLFSService()
	if !lfsSvc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed, skipping test")
	}

	// Create a temp directory
	tmpDir, err := os.MkdirTemp("", "init-lfs-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	targetPath := filepath.Join(tmpDir, "new-lfs-repo")

	gitSvc := NewGitService()
	result := gitSvc.InitRepoWithLFS(targetPath)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify it's a git repo
	info := gitSvc.DetectRepo(targetPath)
	if !info.IsRepo {
		t.Error("Expected directory to be a valid git repo after init")
	}

	// Verify message mentions LFS
	if !strings.Contains(result.Message, "LFS") {
		t.Errorf("Expected message to mention LFS, got: %s", result.Message)
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

// ============================================================================
// ResetHardHead Tests
// ============================================================================

func TestResetHardHead_Success(t *testing.T) {
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
		t.Fatal("Expected changes before reset")
	}

	// Reset hard with confirmation
	result := svc.ResetHardHead(repoPath, true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify no changes
	newStatus := svc.Status(repoPath)
	if newStatus.HasChanges {
		t.Errorf("Expected no changes after reset, got %d files", len(newStatus.ChangedFiles))
	}

	// Verify file content is restored
	content, _ := os.ReadFile(testFile)
	if string(content) != "original" {
		t.Errorf("Expected 'original', got '%s'", string(content))
	}

	// Verify untracked file is removed
	if _, err := os.Stat(newFile); !os.IsNotExist(err) {
		t.Error("Expected untracked file to be removed")
	}
}

func TestResetHardHead_WithoutConfirmation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create changes
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}

	// Try to reset without confirmation
	result := svc.ResetHardHead(repoPath, false)

	if result.Success {
		t.Error("Expected failure without confirmation")
	}
	if !strings.Contains(result.Error, "requires confirmation") {
		t.Errorf("Expected error about confirmation, got: %s", result.Error)
	}
}

func TestResetHardHead_NoChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("content"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Try to reset when there are no changes
	result := svc.ResetHardHead(repoPath, true)

	if result.Success {
		t.Error("Expected failure when no changes to rewind")
	}
	if !strings.Contains(result.Error, "No changes to rewind") {
		t.Errorf("Expected error about no changes, got: %s", result.Error)
	}
}

// ============================================================================
// ResetSoftHead Tests
// ============================================================================

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

// ============================================================================
// v2 Additional Tests - Stash Operations
// ============================================================================

func TestStashPush_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Make changes
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Stash the changes
	result := svc.StashPush(repoPath, "Test stash message")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify working tree is clean
	status := svc.Status(repoPath)
	if status.HasChanges {
		t.Error("Expected clean working tree after stash")
	}
}

func TestStashPush_NoChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Try to stash with no changes
	result := svc.StashPush(repoPath, "")

	if result.Success {
		t.Error("Expected failure when no changes to stash")
	}
}

func TestStashList_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Make changes and stash
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.StashPush(repoPath, "My test stash")

	// List stashes
	stashes, err := svc.StashList(repoPath)
	if err != nil {
		t.Fatalf("Failed to list stashes: %v", err)
	}

	if len(stashes) == 0 {
		t.Fatal("Expected at least one stash")
	}

	// Verify the index is correctly parsed (this was a bug - using loop index instead of actual stash index)
	if stashes[0].Index != 0 {
		t.Errorf("Expected first stash to have Index=0, got %d", stashes[0].Index)
	}
	if stashes[0].Name != "stash@{0}" {
		t.Errorf("Expected stash name 'stash@{0}', got '%s'", stashes[0].Name)
	}
	if !strings.Contains(stashes[0].Message, "My test stash") {
		t.Errorf("Expected stash message to contain 'My test stash', got '%s'", stashes[0].Message)
	}
}

// TestStashList_MultipleStashes verifies correct index parsing with multiple stashes
func TestStashList_MultipleStashes(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create multiple stashes
	for i := 0; i < 3; i++ {
		if err := os.WriteFile(testFile, []byte(fmt.Sprintf("change-%d", i)), 0644); err != nil {
			t.Fatalf("Failed to modify test file: %v", err)
		}
		svc.StashPush(repoPath, fmt.Sprintf("Stash %d", i))
	}

	// List stashes
	stashes, err := svc.StashList(repoPath)
	if err != nil {
		t.Fatalf("Failed to list stashes: %v", err)
	}

	if len(stashes) != 3 {
		t.Fatalf("Expected 3 stashes, got %d", len(stashes))
	}

	// Verify indices are correct (stashes are LIFO, so newest is index 0)
	for i, stash := range stashes {
		expectedName := fmt.Sprintf("stash@{%d}", i)
		if stash.Name != expectedName {
			t.Errorf("Stash %d: expected name '%s', got '%s'", i, expectedName, stash.Name)
		}
		if stash.Index != i {
			t.Errorf("Stash %d: expected Index=%d, got %d", i, i, stash.Index)
		}
	}
}

func TestStashPop_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Make changes and stash
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.StashPush(repoPath, "Test stash")

	// Pop the stash
	result := svc.StashPop(repoPath)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify changes are restored
	content, _ := os.ReadFile(testFile)
	if string(content) != "modified" {
		t.Errorf("Expected 'modified', got '%s'", string(content))
	}
}

func TestStashPop_NoStashes(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Try to pop with no stashes
	result := svc.StashPop(repoPath)

	if result.Success {
		t.Error("Expected failure when no stashes to pop")
	}
}

func TestStashDrop_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Make changes and stash
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}
	svc.StashPush(repoPath, "Test stash")

	// Drop the stash
	result := svc.StashDrop(repoPath, 0, true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify stash is gone
	stashes, _ := svc.StashList(repoPath)
	if len(stashes) != 0 {
		t.Errorf("Expected 0 stashes after drop, got %d", len(stashes))
	}
}

func TestStashDrop_RequiresConfirmation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	result := svc.StashDrop(repoPath, 0, false)

	if result.Success {
		t.Error("Expected failure without confirmation")
	}
	if !strings.Contains(result.Error, "requires confirmation") {
		t.Errorf("Expected error about confirmation, got: %s", result.Error)
	}
}

func TestStashAndSwitchBranch_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Make changes
	if err := os.WriteFile(testFile, []byte("modified"), 0644); err != nil {
		t.Fatalf("Failed to modify test file: %v", err)
	}

	// Switch to new branch with stash
	result := svc.StashAndSwitchBranch(repoPath, "feature-branch", true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify we're on the new branch
	branches := svc.Branches(repoPath)
	if branches.Current != "feature-branch" {
		t.Errorf("Expected to be on 'feature-branch', got '%s'", branches.Current)
	}

	// Verify changes are restored
	content, _ := os.ReadFile(testFile)
	if string(content) != "modified" {
		t.Errorf("Expected 'modified', got '%s'", string(content))
	}
}

func TestStashAndSwitchBranch_NoChanges(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create and commit initial file
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Switch to new branch without any changes
	result := svc.StashAndSwitchBranch(repoPath, "feature-branch", true)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify we're on the new branch
	branches := svc.Branches(repoPath)
	if branches.Current != "feature-branch" {
		t.Errorf("Expected to be on 'feature-branch', got '%s'", branches.Current)
	}
}

// ============================================================================
// v2 Additional Tests - Protected Branches
// ============================================================================

func TestIsProtectedBranch_DefaultList(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Test default protected branches
	tests := []struct {
		branch    string
		protected bool
	}{
		{"main", true},
		{"master", true},
		{"develop", true},
		{"production", true},
		{"release", true},
		{"feature-branch", false},
		{"my-branch", false},
	}

	for _, tc := range tests {
		result := svc.IsProtectedBranch(repoPath, tc.branch)
		if result != tc.protected {
			t.Errorf("IsProtectedBranch(%s) = %v, expected %v", tc.branch, result, tc.protected)
		}
	}
}

func TestIsProtectedBranch_CaseInsensitive(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Test case insensitivity
	if !svc.IsProtectedBranch(repoPath, "MAIN") {
		t.Error("Expected 'MAIN' to be protected (case insensitive)")
	}
	if !svc.IsProtectedBranch(repoPath, "Master") {
		t.Error("Expected 'Master' to be protected (case insensitive)")
	}
}

func TestGetProtectedBranches_Default(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	branches := svc.GetProtectedBranches(repoPath)

	if len(branches) == 0 {
		t.Error("Expected non-empty list of protected branches")
	}

	// Check that main and master are in the list
	hasMain := false
	hasMaster := false
	for _, b := range branches {
		if b == "main" {
			hasMain = true
		}
		if b == "master" {
			hasMaster = true
		}
	}

	if !hasMain || !hasMaster {
		t.Error("Expected 'main' and 'master' in default protected branches")
	}
}

func TestSetProtectedBranches_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Set custom protected branches
	result := svc.SetProtectedBranches(repoPath, []string{"main", "staging", "production"})

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify the branches are updated
	branches := svc.GetProtectedBranches(repoPath)
	if len(branches) != 3 {
		t.Errorf("Expected 3 protected branches, got %d", len(branches))
	}

	// Verify staging is now protected
	if !svc.IsProtectedBranch(repoPath, "staging") {
		t.Error("Expected 'staging' to be protected after setting")
	}
}

// ============================================================================
// v2 Additional Tests - Merge State & Conflict Resolution
// ============================================================================

func TestGetMergeState_NoMerge(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	state := svc.GetMergeState(repoPath)

	if state.InMerge {
		t.Error("Expected InMerge to be false")
	}
	if state.InRebase {
		t.Error("Expected InRebase to be false")
	}
	if state.HasConflicts {
		t.Error("Expected HasConflicts to be false")
	}
}

func TestGetConflictedFiles_NoConflicts(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	conflicted, err := svc.GetConflictedFiles(repoPath)
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}
	if len(conflicted) != 0 {
		t.Errorf("Expected 0 conflicted files, got %d", len(conflicted))
	}
}

// TestMergeConflict_RealConflict creates a real merge conflict and tests detection + resolution
func TestMergeConflict_RealConflict(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	runner := NewCommandRunner()

	// Create initial commit on main
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("line1\nline2\nline3"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create feature branch and modify file
	runner.RunGit(repoPath, "checkout", "-b", "feature")
	if err := os.WriteFile(testFile, []byte("line1\nfeature change\nline3"), 0644); err != nil {
		t.Fatalf("Failed to modify file on feature: %v", err)
	}
	svc.CommitAll(repoPath, "Feature change")

	// Go back to main and make conflicting change
	// First, find the main branch name (could be main or master)
	branches := svc.Branches(repoPath)
	mainBranch := "master"
	for _, b := range branches.Local {
		if b.Name == "main" {
			mainBranch = "main"
			break
		}
	}
	runner.RunGit(repoPath, "checkout", mainBranch)

	if err := os.WriteFile(testFile, []byte("line1\nmain change\nline3"), 0644); err != nil {
		t.Fatalf("Failed to modify file on main: %v", err)
	}
	svc.CommitAll(repoPath, "Main change")

	// Try to merge feature branch - this should create a conflict
	mergeResult := runner.RunGit(repoPath, "merge", "feature")
	// We expect this to fail with a conflict
	if mergeResult.Success {
		t.Skip("Merge succeeded without conflict - test setup issue")
	}

	// Verify we're in a merge state
	state := svc.GetMergeState(repoPath)
	if !state.InMerge {
		t.Error("Expected to be in merge state after conflicting merge")
	}
	if !state.HasConflicts {
		t.Error("Expected HasConflicts to be true")
	}

	// Get conflicted files
	conflicted, err := svc.GetConflictedFiles(repoPath)
	if err != nil {
		t.Fatalf("Failed to get conflicted files: %v", err)
	}
	if len(conflicted) != 1 {
		t.Fatalf("Expected 1 conflicted file, got %d", len(conflicted))
	}
	if conflicted[0].Path != "test.txt" {
		t.Errorf("Expected conflicted file 'test.txt', got '%s'", conflicted[0].Path)
	}
	if conflicted[0].Status != "both-modified" {
		t.Errorf("Expected status 'both-modified', got '%s'", conflicted[0].Status)
	}

	// Resolve conflict by keeping ours
	resolveResult := svc.ResolveConflictKeepOurs(repoPath, "test.txt")
	if !resolveResult.Success {
		t.Errorf("Failed to resolve conflict: %s", resolveResult.Error)
	}

	// Verify no more conflicts
	conflictedAfter, _ := svc.GetConflictedFiles(repoPath)
	if len(conflictedAfter) != 0 {
		t.Errorf("Expected 0 conflicts after resolution, got %d", len(conflictedAfter))
	}

	// Complete the merge
	completeResult := svc.CompleteMerge(repoPath, "Merged feature with conflict resolution")
	if !completeResult.Success {
		t.Errorf("Failed to complete merge: %s", completeResult.Error)
	}

	// Verify we're no longer in merge state
	finalState := svc.GetMergeState(repoPath)
	if finalState.InMerge {
		t.Error("Expected to not be in merge state after completion")
	}

	// Verify our content won
	content, _ := os.ReadFile(testFile)
	if !strings.Contains(string(content), "main change") {
		t.Errorf("Expected 'main change' in file after keeping ours, got: %s", string(content))
	}
}

// TestMergeConflict_AbortMerge tests aborting a merge in progress
func TestMergeConflict_AbortMerge(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()
	runner := NewCommandRunner()

	// Create initial commit on main
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("original"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	// Create feature branch with different content
	runner.RunGit(repoPath, "checkout", "-b", "feature")
	if err := os.WriteFile(testFile, []byte("feature content"), 0644); err != nil {
		t.Fatalf("Failed to modify file on feature: %v", err)
	}
	svc.CommitAll(repoPath, "Feature change")

	// Go back to main and make conflicting change
	branches := svc.Branches(repoPath)
	mainBranch := "master"
	for _, b := range branches.Local {
		if b.Name == "main" {
			mainBranch = "main"
			break
		}
	}
	runner.RunGit(repoPath, "checkout", mainBranch)
	if err := os.WriteFile(testFile, []byte("main content"), 0644); err != nil {
		t.Fatalf("Failed to modify file on main: %v", err)
	}
	svc.CommitAll(repoPath, "Main change")

	// Start merge that will conflict
	runner.RunGit(repoPath, "merge", "feature")

	// Verify we're in merge state
	state := svc.GetMergeState(repoPath)
	if !state.InMerge {
		t.Skip("Not in merge state - test setup issue")
	}

	// Abort the merge
	abortResult := svc.AbortMerge(repoPath)
	if !abortResult.Success {
		t.Errorf("Failed to abort merge: %s", abortResult.Error)
	}

	// Verify we're no longer in merge state
	afterState := svc.GetMergeState(repoPath)
	if afterState.InMerge {
		t.Error("Expected to not be in merge state after abort")
	}

	// Verify content is back to main's version
	content, _ := os.ReadFile(testFile)
	if string(content) != "main content" {
		t.Errorf("Expected 'main content' after abort, got: %s", string(content))
	}
}

func TestAbortMerge_NoMergeInProgress(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	result := svc.AbortMerge(repoPath)

	if result.Success {
		t.Error("Expected failure when no merge in progress")
	}
	if !strings.Contains(result.Error, "No merge or rebase in progress") {
		t.Errorf("Expected error about no merge in progress, got: %s", result.Error)
	}
}

func TestCompleteMerge_NoMergeInProgress(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	testFile := filepath.Join(repoPath, "test.txt")
	if err := os.WriteFile(testFile, []byte("initial"), 0644); err != nil {
		t.Fatalf("Failed to create test file: %v", err)
	}
	svc.CommitAll(repoPath, "Initial commit")

	result := svc.CompleteMerge(repoPath, "Merge commit")

	if result.Success {
		t.Error("Expected failure when no merge in progress")
	}
}

func TestMarkResolved_EmptyPath(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	result := svc.MarkResolved(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
	if !strings.Contains(result.Error, "File path is required") {
		t.Errorf("Expected error about file path required, got: %s", result.Error)
	}
}

func TestResolveConflictKeepOurs_EmptyPath(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	result := svc.ResolveConflictKeepOurs(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
}

func TestResolveConflictKeepTheirs_EmptyPath(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	result := svc.ResolveConflictKeepTheirs(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
}

// TestGetParentBranch_NoParent tests that GetParentBranch fails gracefully in a fresh repo
func TestGetParentBranch_NoParent(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit (default branch is likely "master" in fresh repo)
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	// Since we're on the default branch, GetParentBranch should fail
	result := svc.GetParentBranch(repoPath)

	// It might succeed if it finds master as the parent of itself or fail - both are acceptable
	// The key is it shouldn't crash
	t.Logf("GetParentBranch result: Success=%v, ParentBranch=%s, Source=%s, Error=%s",
		result.Success, result.ParentBranch, result.Source, result.Error)
}

// TestGetParentBranch_WithParent tests parent detection when on a feature branch
func TestGetParentBranch_WithParent(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Rename default branch to "main" for predictable test
	cmd := exec.Command("git", "branch", "-M", "main")
	cmd.Dir = repoPath
	cmd.Run()

	// Create initial commit on main
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	// Create and switch to feature branch
	svc.CreateBranchAndCheckout(repoPath, "feature")

	// GetParentBranch should detect "main" as parent
	result := svc.GetParentBranch(repoPath)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
	if result.ParentBranch != "main" {
		t.Errorf("Expected parent branch 'main', got '%s'", result.ParentBranch)
	}
	if result.Source != "merge-base" && result.Source != "default" {
		t.Errorf("Expected source 'merge-base' or 'default', got '%s'", result.Source)
	}
}

// TestCheckBranchConflicts_AutoDetectParent tests that empty parent branch triggers auto-detection
func TestCheckBranchConflicts_AutoDetectParent(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Rename default branch to "main" for predictable test
	cmd := exec.Command("git", "branch", "-M", "main")
	cmd.Dir = repoPath
	cmd.Run()

	// Create initial commit on main
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("initial content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	// Create and switch to feature branch
	svc.CreateBranchAndCheckout(repoPath, "feature")

	// Make a conflicting change
	os.WriteFile(filePath, []byte("feature content"), 0644)
	svc.CommitAll(repoPath, "Feature commit")

	// Switch to main and make a conflicting change
	svc.CheckoutBranch(repoPath, "main")
	os.WriteFile(filePath, []byte("main content"), 0644)
	svc.CommitAll(repoPath, "Main commit")

	// Switch to feature and check conflicts with auto-detected parent
	svc.CheckoutBranch(repoPath, "feature")
	result := svc.CheckBranchConflicts(repoPath, "") // Empty string triggers auto-detection

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
	if result.ParentBranch != "main" {
		t.Errorf("Expected auto-detected parent 'main', got '%s'", result.ParentBranch)
	}
	if !result.HasConflicts {
		t.Error("Expected conflicts for overlapping changes")
	}
}

// TestCheckBranchConflicts_NoConflicts tests conflict detection when branches can merge cleanly
func TestCheckBranchConflicts_NoConflicts(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit on main
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("initial content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	// Create and switch to feature branch
	svc.CreateBranchAndCheckout(repoPath, "feature")

	// Make a change on feature branch
	os.WriteFile(filePath, []byte("feature content"), 0644)
	svc.CommitAll(repoPath, "Feature commit")

	// Switch back to main and make a non-conflicting change
	svc.CheckoutBranch(repoPath, "main")
	newFilePath := filepath.Join(repoPath, "newfile.txt")
	os.WriteFile(newFilePath, []byte("new file"), 0644)
	svc.CommitAll(repoPath, "Main commit")

	// Switch to feature and check conflicts with main
	svc.CheckoutBranch(repoPath, "feature")
	result := svc.CheckBranchConflicts(repoPath, "main")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
	if result.HasConflicts {
		t.Error("Expected no conflicts for non-overlapping changes")
	}
}

// TestCheckBranchConflicts_WithConflicts tests conflict detection when branches have conflicting changes
func TestCheckBranchConflicts_WithConflicts(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit on main
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("initial content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	// Create and switch to feature branch
	svc.CreateBranchAndCheckout(repoPath, "feature")

	// Make a change on feature branch (modify same line)
	os.WriteFile(filePath, []byte("feature content - modified line 1"), 0644)
	svc.CommitAll(repoPath, "Feature commit")

	// Switch back to main and make a conflicting change
	svc.CheckoutBranch(repoPath, "main")
	os.WriteFile(filePath, []byte("main content - modified line 1"), 0644)
	svc.CommitAll(repoPath, "Main commit")

	// Switch to feature and check conflicts with main
	svc.CheckoutBranch(repoPath, "feature")
	result := svc.CheckBranchConflicts(repoPath, "main")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
	if !result.HasConflicts {
		t.Error("Expected conflicts for overlapping changes")
	}
	if len(result.ConflictedFiles) != 1 {
		t.Errorf("Expected 1 conflicted file, got %d", len(result.ConflictedFiles))
	}
	if result.ConflictedFiles[0].Path != "file.txt" {
		t.Errorf("Expected conflicted file 'file.txt', got '%s'", result.ConflictedFiles[0].Path)
	}
}

// TestCheckBranchConflicts_NonExistentBranch tests error handling for non-existent branch
func TestCheckBranchConflicts_NonExistentBranch(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewGitService()

	// Create initial commit
	filePath := filepath.Join(repoPath, "file.txt")
	os.WriteFile(filePath, []byte("content"), 0644)
	svc.CommitAll(repoPath, "Initial commit")

	result := svc.CheckBranchConflicts(repoPath, "nonexistent-branch")

	if result.Success {
		t.Error("Expected failure for non-existent branch")
	}
	if !strings.Contains(result.Error, "not found") {
		t.Errorf("Expected error about branch not found, got: %s", result.Error)
	}
}

// NOTE: TestCheckBranchConflicts_RealRepo was removed - it was used for manual testing
// with the actual rewind-logic repository. The unit tests above cover the functionality.
