package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewLFSService(t *testing.T) {
	svc := NewLFSService()
	if svc == nil {
		t.Error("Expected non-nil LFSService")
	}
	if svc.runner == nil {
		t.Error("Expected non-nil runner")
	}
}

func TestIsLFSInstalled(t *testing.T) {
	svc := NewLFSService()
	result := svc.IsLFSInstalled()

	// Verify it returns a consistent result (cached via sync.Once)
	result2 := svc.IsLFSInstalled()
	if result != result2 {
		t.Error("IsLFSInstalled should return consistent results")
	}

	// Log result for debugging
	t.Logf("LFS installed: %v", result)
}

func TestGetLFSVersion(t *testing.T) {
	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed, skipping version test")
	}

	version, err := svc.GetLFSVersion()
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}
	if version == "" {
		t.Error("Expected non-empty version string")
	}
	// Version should start with "git-lfs/"
	if !strings.HasPrefix(version, "git-lfs/") {
		t.Errorf("Expected version to start with 'git-lfs/', got '%s'", version)
	}
}

func TestIsLFSEnabled_NoGitattributes(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	info := svc.IsLFSEnabled(repoPath)

	if info.HasError {
		t.Errorf("Expected no error, got: %s", info.Error)
	}
	if info.Enabled {
		t.Error("Expected LFS to not be enabled without .gitattributes")
	}
}

func TestIsLFSEnabled_WithLFSTracking(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	// Create a .gitattributes with LFS tracking
	gitattributes := filepath.Join(repoPath, ".gitattributes")
	content := "*.bin filter=lfs diff=lfs merge=lfs -text\n"
	if err := os.WriteFile(gitattributes, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create .gitattributes: %v", err)
	}

	info := svc.IsLFSEnabled(repoPath)

	if info.HasError {
		t.Errorf("Expected no error, got: %s", info.Error)
	}
	if !info.Enabled {
		t.Error("Expected LFS to be enabled with LFS tracking in .gitattributes")
	}
}

func TestGetTrackedPatterns_Empty(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	patterns, err := svc.GetTrackedPatterns(repoPath)
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}
	if len(patterns) != 0 {
		t.Errorf("Expected 0 patterns, got %d", len(patterns))
	}
}

func TestGetTrackedPatterns_WithPatterns(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	// Create a .gitattributes with multiple LFS patterns
	gitattributes := filepath.Join(repoPath, ".gitattributes")
	content := `# LFS tracked files
*.bin filter=lfs diff=lfs merge=lfs -text
*.acd filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text
# Non-LFS entry
*.txt text
`
	if err := os.WriteFile(gitattributes, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to create .gitattributes: %v", err)
	}

	patterns, err := svc.GetTrackedPatterns(repoPath)
	if err != nil {
		t.Errorf("Expected no error, got: %v", err)
	}
	if len(patterns) != 3 {
		t.Errorf("Expected 3 patterns, got %d", len(patterns))
	}

	// Check that we have the expected patterns
	expectedPatterns := map[string]bool{"*.bin": false, "*.acd": false, "*.psd": false}
	for _, p := range patterns {
		if _, ok := expectedPatterns[p.Pattern]; ok {
			expectedPatterns[p.Pattern] = true
		}
	}
	for pattern, found := range expectedPatterns {
		if !found {
			t.Errorf("Expected to find pattern '%s'", pattern)
		}
	}
}

func TestTrackPattern_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	// Initialize LFS first
	svc.InitializeLFS(repoPath)

	// Track a pattern
	result := svc.TrackPattern(repoPath, "*.bin")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify pattern is tracked
	patterns, _ := svc.GetTrackedPatterns(repoPath)
	found := false
	for _, p := range patterns {
		if p.Pattern == "*.bin" {
			found = true
			break
		}
	}
	if !found {
		t.Error("Expected '*.bin' to be tracked")
	}
}

func TestTrackPattern_EmptyPattern(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	result := svc.TrackPattern(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty pattern")
	}
	if !strings.Contains(result.Error, "Pattern is required") {
		t.Errorf("Expected error about pattern required, got: %s", result.Error)
	}
}

func TestUntrackPattern_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	// Initialize LFS and track a pattern
	svc.InitializeLFS(repoPath)
	svc.TrackPattern(repoPath, "*.bin")

	// Untrack the pattern
	result := svc.UntrackPattern(repoPath, "*.bin")

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}

	// Verify pattern is no longer tracked
	patterns, _ := svc.GetTrackedPatterns(repoPath)
	for _, p := range patterns {
		if p.Pattern == "*.bin" {
			t.Error("Expected '*.bin' to not be tracked anymore")
		}
	}
}

func TestUntrackPattern_EmptyPattern(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	result := svc.UntrackPattern(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty pattern")
	}
}

func TestGetPresetPatterns(t *testing.T) {
	svc := NewLFSService()

	patterns := svc.GetPresetPatterns()

	if len(patterns) == 0 {
		t.Error("Expected non-empty list of preset patterns")
	}

	// Verify that calling it twice returns the same slice (not allocating new memory each call)
	patterns2 := svc.GetPresetPatterns()
	if &patterns[0] != &patterns2[0] {
		t.Error("GetPresetPatterns should return the same slice reference, not allocate new memory each call")
	}

	// Check that industrial patterns are included
	hasAcd := false
	for _, p := range patterns {
		if p.Pattern == "*.acd" {
			hasAcd = true
			if p.Category != "industrial" {
				t.Errorf("Expected '*.acd' to be in 'industrial' category, got '%s'", p.Category)
			}
		}
	}

	if !hasAcd {
		t.Error("Expected '*.acd' in preset patterns (Rockwell)")
	}
}

func TestInitializeLFS_Success(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	result := svc.InitializeLFS(repoPath)

	if !result.Success {
		t.Errorf("Expected success, got error: %s", result.Error)
	}
}

func TestLFSLock_EmptyPath(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	result := svc.LFSLock(repoPath, "")

	if result.Success {
		t.Error("Expected failure for empty path")
	}
	if !strings.Contains(result.Error, "File path is required") {
		t.Errorf("Expected error about file path required, got: %s", result.Error)
	}
}

func TestLFSUnlock_EmptyPath(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	result := svc.LFSUnlock(repoPath, "", false)

	if result.Success {
		t.Error("Expected failure for empty path")
	}
	if !strings.Contains(result.Error, "File path is required") {
		t.Errorf("Expected error about file path required, got: %s", result.Error)
	}
}

func TestLFSStatus_NoLFS(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	files, err := svc.LFSStatus(repoPath)
	if err != nil {
		t.Errorf("Expected no error for repo without LFS, got: %v", err)
	}
	if files == nil {
		t.Error("Expected non-nil slice (possibly empty)")
	}
}

func TestLFSLocks_NoRemote(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	// Without a remote, locks should return an error about missing protocol
	locks, err := svc.LFSLocks(repoPath)

	// The function should either:
	// 1. Return an error (because no remote configured)
	// 2. Return empty slice (if locking not enabled message is detected)
	if err == nil && locks != nil {
		// If no error, locks must be empty (no remote = no locks)
		if len(locks) > 0 {
			t.Error("Expected empty locks for repo without remote")
		}
	}
	// If error, that's expected for repo without remote - no assertion needed
}

func TestCheckLocksBeforeBranchSwitch_NoLFS(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	svc := NewLFSService()

	if !svc.IsLFSInstalled() {
		t.Skip("Git LFS is not installed")
	}

	locks, err := svc.CheckLocksBeforeBranchSwitch(repoPath)

	// For repo without remote/LFS server:
	// - Error is acceptable (no remote configured)
	// - Empty locks is acceptable (locking not enabled)
	// - Non-empty locks would be wrong
	if err == nil && len(locks) > 0 {
		t.Error("Expected empty locks for repo without LFS server, got locks")
	}
}

// TestIsLFSInstalledCaching verifies that the LFS installation check is cached
func TestIsLFSInstalledCaching(t *testing.T) {
	// Create two separate services to verify caching is per-instance
	svc1 := NewLFSService()
	svc2 := NewLFSService()

	result1a := svc1.IsLFSInstalled()
	result1b := svc1.IsLFSInstalled()
	result2 := svc2.IsLFSInstalled()

	// Same instance should return consistent results
	if result1a != result1b {
		t.Error("Same LFSService instance should return consistent IsLFSInstalled results")
	}

	// Different instances should also return consistent results (same system)
	if result1a != result2 {
		t.Error("Different LFSService instances should return same IsLFSInstalled result on same system")
	}
}
