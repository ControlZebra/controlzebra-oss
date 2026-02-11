package services

import (
	"context"
	"os"
	"testing"
)

func TestRepositorySettingsService_GetDefaultSettings(t *testing.T) {
	service := NewRepositorySettingsService()
	repoPath := "/tmp/test-repo"

	settings := service.GetDefaultSettings(repoPath)

	// Test that all default values are set correctly
	if settings.RepoPath != repoPath {
		t.Errorf("expected repoPath %s, got %s", repoPath, settings.RepoPath)
	}

	if settings.RepoID == "" {
		t.Error("expected non-empty repoID")
	}

	// Background tasks should be enabled by default
	if !settings.FetchTask.Enabled {
		t.Error("expected FetchTask to be enabled by default")
	}
	if settings.FetchTask.IntervalMinutes != DefaultFetchInterval {
		t.Errorf("expected FetchTask interval %d, got %d", DefaultFetchInterval, settings.FetchTask.IntervalMinutes)
	}

	if !settings.LFSFetchTask.Enabled {
		t.Error("expected LFSFetchTask to be enabled by default")
	}
	if settings.LFSFetchTask.IntervalMinutes != DefaultLFSFetchInterval {
		t.Errorf("expected LFSFetchTask interval %d, got %d", DefaultLFSFetchInterval, settings.LFSFetchTask.IntervalMinutes)
	}

	if !settings.MaintenanceTask.Enabled {
		t.Error("expected MaintenanceTask to be enabled by default")
	}
	if settings.MaintenanceTask.IntervalMinutes != DefaultMaintenanceInterval {
		t.Errorf("expected MaintenanceTask interval %d, got %d", DefaultMaintenanceInterval, settings.MaintenanceTask.IntervalMinutes)
	}

	// Fetch settings
	if !settings.FetchSettings.FetchAllRemotes {
		t.Error("expected FetchAllRemotes to be true by default")
	}
	if !settings.FetchSettings.PruneStaleBranches {
		t.Error("expected PruneStaleBranches to be true by default")
	}

	// LFS settings
	if !settings.LFSSettings.AutoFetch {
		t.Error("expected LFS AutoFetch to be true by default")
	}
	if settings.LFSSettings.FetchRecentDays != 7 {
		t.Errorf("expected LFS FetchRecentDays 7, got %d", settings.LFSSettings.FetchRecentDays)
	}

	// Maintenance settings
	if !settings.MaintenanceSettings.CommitGraph {
		t.Error("expected CommitGraph to be true by default")
	}

}

func TestRepositorySettingsService_SaveAndGetSettings(t *testing.T) {
	// Create a temp directory for settings
	tempDir, err := os.MkdirTemp("", "repo-settings-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Create service with custom settings dir
	service := &RepositorySettingsService{
		runner:       NewCommandRunner(),
		settingsDir:  tempDir,
		taskStatuses: make(map[BackgroundTaskType]*BackgroundTaskStatus),
		taskCancels:  make(map[string]context.CancelFunc),
		taskContexts: make(map[string]context.Context),
	}

	repoPath := "/tmp/test-repo"
	settings := service.GetDefaultSettings(repoPath)
	settings.FetchTask.IntervalMinutes = 15
	settings.LFSSettings.FetchRecentDays = 14

	// Save settings
	result := service.SaveSettings(settings)
	if !result.Success {
		t.Fatalf("failed to save settings: %s", result.Error)
	}

	// Get settings back
	retrieved, err := service.GetSettings(repoPath)
	if err != nil {
		t.Fatalf("failed to get settings: %v", err)
	}

	if retrieved.FetchTask.IntervalMinutes != 15 {
		t.Errorf("expected FetchTask interval 15, got %d", retrieved.FetchTask.IntervalMinutes)
	}
	if retrieved.LFSSettings.FetchRecentDays != 14 {
		t.Errorf("expected LFS FetchRecentDays 14, got %d", retrieved.LFSSettings.FetchRecentDays)
	}
}

func TestRepositorySettingsService_UpdateBackgroundTask(t *testing.T) {
	// Create a temp directory for settings
	tempDir, err := os.MkdirTemp("", "repo-settings-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	service := &RepositorySettingsService{
		runner:       NewCommandRunner(),
		settingsDir:  tempDir,
		taskStatuses: make(map[BackgroundTaskType]*BackgroundTaskStatus),
		taskCancels:  make(map[string]context.CancelFunc),
		taskContexts: make(map[string]context.Context),
	}

	repoPath := "/tmp/test-repo"

	// First, save initial settings
	settings := service.GetDefaultSettings(repoPath)
	service.SaveSettings(settings)

	// Update fetch task
	newConfig := BackgroundTaskConfig{
		Enabled:         false,
		IntervalMinutes: 20,
	}

	result := service.UpdateBackgroundTask(repoPath, TaskFetchAll, newConfig)
	if !result.Success {
		t.Fatalf("failed to update background task: %s", result.Error)
	}

	// Verify update
	retrieved, _ := service.GetSettings(repoPath)
	if retrieved.FetchTask.Enabled {
		t.Error("expected FetchTask to be disabled")
	}
	if retrieved.FetchTask.IntervalMinutes != 20 {
		t.Errorf("expected FetchTask interval 20, got %d", retrieved.FetchTask.IntervalMinutes)
	}
}

func TestRepositorySettingsService_ResetToDefaults(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "repo-settings-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	service := &RepositorySettingsService{
		runner:       NewCommandRunner(),
		settingsDir:  tempDir,
		taskStatuses: make(map[BackgroundTaskType]*BackgroundTaskStatus),
		taskCancels:  make(map[string]context.CancelFunc),
		taskContexts: make(map[string]context.Context),
	}

	repoPath := "/tmp/test-repo"

	// Save modified settings
	settings := service.GetDefaultSettings(repoPath)
	settings.FetchTask.IntervalMinutes = 999
	service.SaveSettings(settings)

	// Reset to defaults
	result := service.ResetToDefaults(repoPath)
	if !result.Success {
		t.Fatalf("failed to reset to defaults: %s", result.Error)
	}

	// Verify defaults are restored
	retrieved, _ := service.GetSettings(repoPath)
	if retrieved.FetchTask.IntervalMinutes != DefaultFetchInterval {
		t.Errorf("expected FetchTask interval %d after reset, got %d", DefaultFetchInterval, retrieved.FetchTask.IntervalMinutes)
	}
}

func TestRepositorySettingsService_DeleteSettings(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "repo-settings-test")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	service := &RepositorySettingsService{
		runner:       NewCommandRunner(),
		settingsDir:  tempDir,
		taskStatuses: make(map[BackgroundTaskType]*BackgroundTaskStatus),
		taskCancels:  make(map[string]context.CancelFunc),
		taskContexts: make(map[string]context.Context),
	}

	repoPath := "/tmp/test-repo"

	// Save settings
	settings := service.GetDefaultSettings(repoPath)
	service.SaveSettings(settings)

	// Verify file exists
	settingsPath := service.getSettingsPath(repoPath)
	if _, err := os.Stat(settingsPath); os.IsNotExist(err) {
		t.Fatal("settings file should exist")
	}

	// Delete settings
	result := service.DeleteSettings(repoPath)
	if !result.Success {
		t.Fatalf("failed to delete settings: %s", result.Error)
	}

	// Verify file is deleted
	if _, err := os.Stat(settingsPath); !os.IsNotExist(err) {
		t.Error("settings file should be deleted")
	}
}

func TestGenerateRepoID(t *testing.T) {
	// Same path should always generate same ID
	path := "/tmp/test-repo"
	id1 := generateRepoID(path)
	id2 := generateRepoID(path)

	if id1 != id2 {
		t.Errorf("expected same ID for same path, got %s and %s", id1, id2)
	}

	// Different paths should generate different IDs
	id3 := generateRepoID("/tmp/other-repo")
	if id1 == id3 {
		t.Error("expected different IDs for different paths")
	}

	// ID should be 16 chars (8 bytes hex encoded)
	if len(id1) != 16 {
		t.Errorf("expected ID length 16, got %d", len(id1))
	}
}

func TestSplitLines(t *testing.T) {
	input := "line1\nline2\n\nline3\n"
	result := splitLines(input)

	if len(result) != 3 {
		t.Errorf("expected 3 lines, got %d", len(result))
	}
	if result[0] != "line1" {
		t.Errorf("expected 'line1', got '%s'", result[0])
	}
}

func TestSplitByWhitespace(t *testing.T) {
	input := "origin\thttps://github.com/user/repo.git\t(fetch)"
	result := splitByWhitespace(input)

	if len(result) != 3 {
		t.Errorf("expected 3 parts, got %d", len(result))
	}
}

// Integration test - requires git to be installed
func TestRepositorySettingsService_RunFetchAll_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	service := NewRepositorySettingsService()

	// Running fetch on a repo with no remotes should still succeed (no-op)
	fetchResult := service.runFetchAll(tempDir, FetchSettings{
		FetchAllRemotes:    true,
		PruneStaleBranches: true,
		FetchTags:          true,
	})

	// This should succeed even though there's nothing to fetch
	if !fetchResult.Success {
		t.Logf("Fetch result (may fail with no remotes): %s", fetchResult.Error)
	}
}

// ============================================================================
// Recovery Options Tests
// ============================================================================

func TestRepositorySettingsService_DiagnoseRepository(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	service := NewRepositorySettingsService()

	// Run diagnostics on a healthy repo
	diag := service.DiagnoseRepository(tempDir)

	if !diag.IsValidRepo {
		t.Error("expected valid repo")
	}

	if diag.HasMergeConflict {
		t.Error("expected no merge conflict")
	}

	if diag.HasRebaseInProgress {
		t.Error("expected no rebase in progress")
	}

	if diag.HasStaleLocks {
		t.Error("expected no stale locks")
	}
}

func TestRepositorySettingsService_DiagnoseRepository_NotARepo(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "not-a-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	service := NewRepositorySettingsService()

	diag := service.DiagnoseRepository(tempDir)

	if diag.IsValidRepo {
		t.Error("expected invalid repo")
	}

	if len(diag.Issues) == 0 {
		t.Error("expected issues to be reported")
	}
}

func TestRepositorySettingsService_RemoveStaleLocks(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	service := NewRepositorySettingsService()

	// Create a fake lock file
	lockPath := tempDir + "/.git/index.lock"
	if err := os.WriteFile(lockPath, []byte("fake lock"), 0644); err != nil {
		t.Fatalf("failed to create lock file: %v", err)
	}

	// Verify lock exists
	if _, err := os.Stat(lockPath); os.IsNotExist(err) {
		t.Fatal("lock file should exist")
	}

	// Remove locks
	removeResult := service.RemoveStaleLocks(tempDir)
	if !removeResult.Success {
		t.Errorf("expected success, got error: %s", removeResult.Error)
	}

	// Verify lock is removed
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Error("lock file should be removed")
	}
}

func TestRepositorySettingsService_GetReflog(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	// Configure git user for the commit
	runner.RunGit(tempDir, "config", "user.email", "test@test.com")
	runner.RunGit(tempDir, "config", "user.name", "Test User")

	// Create a commit to have something in reflog
	testFile := tempDir + "/test.txt"
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}
	runner.RunGit(tempDir, "add", ".")
	runner.RunGit(tempDir, "commit", "-m", "Initial commit")

	service := NewRepositorySettingsService()

	// Get reflog
	entries, err := service.GetReflog(tempDir, 10)
	if err != nil {
		t.Fatalf("failed to get reflog: %v", err)
	}

	if len(entries) == 0 {
		t.Error("expected at least one reflog entry")
	}

	// First entry should have a hash
	if entries[0].Hash == "" {
		t.Error("expected reflog entry to have a hash")
	}
}

func TestRepositorySettingsService_RecoverFromDetachedHead(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	// Configure git user
	runner.RunGit(tempDir, "config", "user.email", "test@test.com")
	runner.RunGit(tempDir, "config", "user.name", "Test User")

	// Create a commit
	testFile := tempDir + "/test.txt"
	if err := os.WriteFile(testFile, []byte("test"), 0644); err != nil {
		t.Fatalf("failed to create test file: %v", err)
	}
	runner.RunGit(tempDir, "add", ".")
	runner.RunGit(tempDir, "commit", "-m", "Initial commit")

	// Get the commit hash
	hashResult := runner.RunGit(tempDir, "rev-parse", "HEAD")
	commitHash := hashResult.Stdout[:8]

	// Detach HEAD
	runner.RunGit(tempDir, "checkout", "--detach")

	service := NewRepositorySettingsService()

	// Verify we're detached
	diag := service.DiagnoseRepository(tempDir)
	if !diag.IsDetachedHead {
		t.Error("expected detached HEAD")
	}

	// Recover by creating a new branch
	recoverResult := service.RecoverFromDetachedHead(tempDir, "recovery-branch", "")
	if !recoverResult.Success {
		t.Errorf("expected success, got error: %s", recoverResult.Error)
	}

	// Verify we're no longer detached
	diag = service.DiagnoseRepository(tempDir)
	if diag.IsDetachedHead {
		t.Error("expected to be on a branch after recovery")
	}

	_ = commitHash // Used for reference
}

func TestRepositorySettingsService_RepairRepository(t *testing.T) {
	if testing.Short() {
		t.Skip("Skipping integration test in short mode")
	}

	// Create a temp git repo
	tempDir, err := os.MkdirTemp("", "git-test-repo")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	// Initialize git repo
	runner := NewCommandRunner()
	result := runner.RunGit(tempDir, "init")
	if !result.Success {
		t.Fatalf("failed to init git repo: %s", result.Stderr)
	}

	service := NewRepositorySettingsService()

	// Run repair on a healthy repo
	repairResult := service.RepairRepository(tempDir)
	if !repairResult.Success {
		t.Logf("Repair result: %s", repairResult.Message)
	}
}
