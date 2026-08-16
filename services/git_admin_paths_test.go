package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func TestGitAdminPathsResolvesEveryNameInOrder(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	names := []string{"MERGE_HEAD", "rebase-apply/applying", "index.lock"}
	paths, err := gitAdminPaths(NewCommandRunner(), repoPath, names...)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(paths) != len(names) {
		t.Fatalf("expected %d paths, got %d", len(names), len(paths))
	}
	for i, name := range names {
		if !strings.HasSuffix(filepath.ToSlash(paths[i]), name) {
			t.Fatalf("path %d is %q, expected it to end in %q", i, paths[i], name)
		}
		if !filepath.IsAbs(paths[i]) {
			t.Fatalf("expected an absolute path, got %q", paths[i])
		}
	}
}

func TestGitAdminPathsRejectsNonRepository(t *testing.T) {
	if _, err := gitAdminPaths(NewCommandRunner(), t.TempDir(), "MERGE_HEAD"); err == nil {
		t.Fatal("expected an error outside a repository")
	}
}

func TestGitAdminPathsRejectsEmptyName(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	if _, err := gitAdminPaths(NewCommandRunner(), repoPath, "  "); err == nil {
		t.Fatal("expected an error for an empty name")
	}
}

// The whole reason this file exists: <repo>/.git is not where a linked
// worktree keeps its per-worktree state.
func TestGitAdminPathsAreWorktreeSpecific(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	runner := NewCommandRunner()

	mainMergeHead, err := gitAdminPath(runner, fixture.openProject, "MERGE_HEAD")
	if err != nil {
		t.Fatalf("resolve in open project: %v", err)
	}
	linkedMergeHead, err := gitAdminPath(runner, fixture.linkedWorktree, "MERGE_HEAD")
	if err != nil {
		t.Fatalf("resolve in linked worktree: %v", err)
	}
	if mainMergeHead == linkedMergeHead {
		t.Fatalf("expected per-worktree paths, both resolved to %s", mainMergeHead)
	}
	if strings.HasPrefix(filepath.ToSlash(linkedMergeHead), filepath.ToSlash(fixture.linkedWorktree)+"/.git/") {
		t.Fatalf("linked worktree state should not live under its own .git: %s", linkedMergeHead)
	}
}

func TestGitCommonDirIsSharedAcrossWorktrees(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	runner := NewCommandRunner()

	fromProject, err := gitCommonDirPath(runner, fixture.openProject)
	if err != nil {
		t.Fatalf("common dir from open project: %v", err)
	}
	fromLinked, err := gitCommonDirPath(runner, fixture.linkedWorktree)
	if err != nil {
		t.Fatalf("common dir from linked worktree: %v", err)
	}
	if normalizeRepositoryKey(fromProject) != normalizeRepositoryKey(fromLinked) {
		t.Fatalf("expected one common dir, got %s and %s", fromProject, fromLinked)
	}

	gitDir, err := gitDirPath(runner, fixture.linkedWorktree)
	if err != nil {
		t.Fatalf("git dir from linked worktree: %v", err)
	}
	if normalizeRepositoryKey(gitDir) == normalizeRepositoryKey(fromLinked) {
		t.Fatal("expected a linked worktree's git dir to differ from the common dir")
	}
}

// A merge started in one worktree must not look like a merge in another.
func TestGetMergeStateIsScopedToItsWorktree(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	svc := NewGitService()

	commitFileAt(t, fixture.linkedWorktree, "shared.txt", "line\nfeature\n", "feature edit")
	commitFileAt(t, fixture.openProject, "shared.txt", "line\nmain\n", "main edit")

	if _, err := runGitAllowFail(t, fixture.linkedWorktree, "merge", "--no-commit", "--no-ff", "main"); err == nil {
		t.Fatal("expected the merge to conflict")
	}

	if state := svc.GetMergeState(fixture.linkedWorktree); !state.InMerge {
		t.Fatal("expected the linked worktree to report an interrupted merge")
	}
	if state := svc.GetMergeState(fixture.openProject); state.InMerge {
		t.Fatal("the open project must not inherit another worktree's merge")
	}
}

func TestGetMergeStateDetectsLocksInALinkedWorktree(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	svc := NewGitService()

	lockPath, err := gitAdminPath(NewCommandRunner(), fixture.linkedWorktree, "index.lock")
	if err != nil {
		t.Fatalf("resolve index.lock: %v", err)
	}
	if err := os.WriteFile(lockPath, nil, 0o644); err != nil {
		t.Fatalf("create lock: %v", err)
	}

	state := svc.GetMergeState(fixture.linkedWorktree)
	if !state.HasLockFile || len(state.LockFiles) != 1 || state.LockFiles[0] != "index.lock" {
		t.Fatalf("expected index.lock to be reported, got %+v", state.LockFiles)
	}
	if svc.GetMergeState(fixture.openProject).HasLockFile {
		t.Fatal("the open project must not inherit another worktree's lock")
	}

	if result := svc.RemoveAllStaleLocks(fixture.linkedWorktree, true); !result.Success {
		t.Fatalf("expected the lock to be removable: %s", result.Error)
	}
	if _, err := os.Stat(lockPath); !os.IsNotExist(err) {
		t.Fatal("expected the lock file to be gone")
	}
}

func TestGetMergeStateReturnsEmptyStateOutsideARepository(t *testing.T) {
	if state := NewGitService().GetMergeState(t.TempDir()); state.StuckType != "" {
		t.Fatalf("expected an empty state outside a repository, got %+v", state)
	}
}

func TestDiagnoseRepositoryIsScopedToItsWorktree(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	service := NewRepositorySettingsService()

	commitFileAt(t, fixture.linkedWorktree, "shared.txt", "line\nfeature\n", "feature edit")
	commitFileAt(t, fixture.openProject, "shared.txt", "line\nmain\n", "main edit")

	if _, err := runGitAllowFail(t, fixture.linkedWorktree, "merge", "--no-commit", "--no-ff", "main"); err == nil {
		t.Fatal("expected the merge to conflict")
	}

	if !service.DiagnoseRepository(fixture.linkedWorktree).HasMergeConflict {
		t.Fatal("expected the linked worktree to report an interrupted merge")
	}
	if service.DiagnoseRepository(fixture.openProject).HasMergeConflict {
		t.Fatal("the open project must not inherit another worktree's merge")
	}
}

// HEAD.lock is per-worktree while config.lock is shared, so both must be
// resolved by name rather than joined onto the caller's path.
func TestRemoveStaleLocksHandlesLinkedWorktreeLocks(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	service := NewRepositorySettingsService()

	paths, err := gitAdminPaths(NewCommandRunner(), fixture.linkedWorktree, "HEAD.lock", "config.lock")
	if err != nil {
		t.Fatalf("resolve lock paths: %v", err)
	}
	for _, path := range paths {
		if err := os.WriteFile(path, nil, 0o644); err != nil {
			t.Fatalf("create lock %s: %v", path, err)
		}
	}

	diag := service.DiagnoseRepository(fixture.linkedWorktree)
	if !diag.HasStaleLocks || len(diag.StaleLockFiles) != 2 {
		t.Fatalf("expected both locks reported, got %+v", diag.StaleLockFiles)
	}

	if result := service.RemoveStaleLocks(fixture.linkedWorktree); !result.Success {
		t.Fatalf("expected lock removal to succeed: %s", result.Error)
	}
	for _, path := range paths {
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be removed", path)
		}
	}
}

// Every worktree of one repository must produce one identity, otherwise the
// one-active-review rule and per-repository serialization both stop working.
func TestRepositoryIdentityIsSharedAcrossWorktrees(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	runner := NewCommandRunner()

	fromProject, err := repositoryIdentity(runner, fixture.openProject)
	if err != nil {
		t.Fatalf("identity from open project: %v", err)
	}
	fromLinked, err := repositoryIdentity(runner, fixture.linkedWorktree)
	if err != nil {
		t.Fatalf("identity from linked worktree: %v", err)
	}
	if fromProject != fromLinked {
		t.Fatalf("expected one identity, got %s and %s", fromProject, fromLinked)
	}

	other := newLinkedWorktreeRepo(t)
	fromOther, err := repositoryIdentity(runner, other.openProject)
	if err != nil {
		t.Fatalf("identity from unrelated repo: %v", err)
	}
	if fromOther == fromProject {
		t.Fatal("expected unrelated repositories to have different identities")
	}
}

type failingAdminPathRunner struct{}

func (failingAdminPathRunner) RunGit(string, ...string) CommandResult {
	return CommandResult{Success: false, Stderr: "not a git repository"}
}

func TestRepositoryLockKeyFallsBackToThePath(t *testing.T) {
	path := t.TempDir()
	if key := repositoryLockKey(failingAdminPathRunner{}, path); key != normalizeRepositoryKey(path) {
		t.Fatalf("expected the path fallback, got %q", key)
	}
}

func TestRepositoryCoordinatorSerializesWorktreesOfOneRepository(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)
	coordinator := &repositoryCoordinator{}

	key := repositoryLockKey(NewCommandRunner(), fixture.openProject)
	linkedKey := repositoryLockKey(NewCommandRunner(), fixture.linkedWorktree)
	if key != linkedKey {
		t.Fatalf("expected both worktrees to share a lock key, got %q and %q", key, linkedKey)
	}

	release := coordinator.lockKey(key)
	acquired := make(chan struct{})
	var once sync.Once
	go func() {
		unlock := coordinator.lockKey(linkedKey)
		once.Do(func() { close(acquired) })
		unlock()
	}()

	select {
	case <-acquired:
		t.Fatal("the second worktree acquired the lock while the first held it")
	default:
	}

	release()
	<-acquired
}
