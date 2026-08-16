package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Phase 2 of the Isolated Conflict Resolution Plan. These tests drive the real
// service against real Git and re-assert the Phase 0 invariant that matters
// most: the user's open project is never left mid-merge.

func newTestIntegrationService(t *testing.T) *IntegrationSessionService {
	t.Helper()
	dir := t.TempDir()
	return &IntegrationSessionService{
		git:           NewCommandRunner(),
		target:        NewGitService(),
		store:         newIntegrationSessionStore(dir),
		workspaceRoot: integrationWorkspaceRoot(dir),
		preparing:     map[string]bool{},
	}
}

// newFeatureBranchRepo is the ordinary ControlZebra shape: one project
// directory, the user on a feature branch, the destination checked out nowhere.
func newFeatureBranchRepo(t *testing.T) string {
	t.Helper()
	repo := createTestRepo(t)
	t.Cleanup(func() { os.RemoveAll(repo) })

	runGitCmd(t, repo, "config", "core.autocrlf", "false")
	commitFileAt(t, repo, "shared.txt", "base\n", "base")
	runGitCmd(t, repo, "branch", "-M", "main")
	runGitCmd(t, repo, "checkout", "-b", "feature")
	return repo
}

func assertResultUnreachable(t *testing.T, repoPath string, oid string) {
	t.Helper()
	output, _ := runGitAllowFail(t, repoPath, "branch", "--contains", oid)
	if strings.TrimSpace(output) != "" {
		t.Fatalf("prepared result is reachable from a branch:\n%s", output)
	}
}

func TestPrepareReadinessStaysSilentWithoutADestination(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newLinkedWorktreeRepo(t)

	// Sitting on the integration branch itself: nothing to check against.
	snapshot := service.PrepareReadiness(fixture.openProject, false)

	if snapshot.SessionID != "" || snapshot.State != "" {
		t.Fatalf("expected no session, got %+v", snapshot)
	}
	sessions, err := service.store.list()
	if err != nil {
		t.Fatalf("list sessions: %v", err)
	}
	if len(sessions) != 0 {
		t.Fatalf("expected no persisted sessions, got %d", len(sessions))
	}
}

func TestPrepareReadinessReachesReadyWithoutMovingAnyBranch(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)

	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")
	sourceBefore := revParse(t, repo, "refs/heads/feature")
	destinationBefore := revParse(t, repo, "refs/heads/main")

	snapshot := service.PrepareReadiness(repo, false)

	if snapshot.State != integrationStateReady {
		t.Fatalf("expected ready, got %q (%s)", snapshot.State, snapshot.Error)
	}
	if !snapshot.HasResult {
		t.Fatal("expected a prepared result")
	}
	if snapshot.TargetBranch != "main" || snapshot.SourceBranch != "feature" {
		t.Fatalf("unexpected branches: %+v", snapshot)
	}
	if revParse(t, repo, "refs/heads/feature") != sourceBefore {
		t.Fatal("the feature branch moved during a readiness check")
	}
	if revParse(t, repo, "refs/heads/main") != destinationBefore {
		t.Fatal("the destination branch moved during a readiness check")
	}
	if status := strings.TrimSpace(runGitOutput(t, repo, "status", "--porcelain")); status != "" {
		t.Fatalf("the open project is dirty after a readiness check:\n%s", status)
	}

	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	assertResultUnreachable(t, repo, session.ResultOID)
}

func TestPrepareReadinessReportsFilesNeedingADecision(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newLinkedWorktreeRepo(t)

	commitFileAt(t, fixture.openProject, "shared.txt", "line\nmain\n", "main edit")
	commitFileAt(t, fixture.linkedWorktree, "shared.txt", "line\nfeature\n", "feature edit")

	snapshot := service.PrepareReadiness(fixture.linkedWorktree, false)

	if snapshot.State != integrationStateNeedsDecisions {
		t.Fatalf("expected needs-decisions, got %q (%s)", snapshot.State, snapshot.Error)
	}
	if snapshot.HasResult {
		t.Fatal("a conflicting check must not produce a result")
	}
	if status := strings.TrimSpace(runGitOutput(t, fixture.openProject, "status", "--porcelain")); status != "" {
		t.Fatalf("the open project is dirty after a conflicting check:\n%s", status)
	}
	if state := (&GitService{runner: NewCommandRunner()}).GetMergeState(fixture.linkedWorktree); state.InMerge {
		t.Fatal("the user's working copy was left mid-merge")
	}
}

func TestPrepareReadinessReusesAMatchingSession(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	first := service.PrepareReadiness(repo, false)
	second := service.PrepareReadiness(repo, false)

	if first.SessionID == "" || first.SessionID != second.SessionID {
		t.Fatalf("expected the same session, got %q then %q", first.SessionID, second.SessionID)
	}
}

func TestPrepareReadinessReplacesTheSessionWhenSavedWorkChanges(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	first := service.PrepareReadiness(repo, false)
	firstSession, err := service.store.load(first.SessionID)
	if err != nil {
		t.Fatalf("load first session: %v", err)
	}

	commitFileAt(t, repo, "feature.txt", "changed again\n", "second feature edit")
	second := service.PrepareReadiness(repo, false)

	if second.SessionID == first.SessionID {
		t.Fatal("expected a fresh session after the saved work changed")
	}
	if _, err := service.store.load(first.SessionID); !os.IsNotExist(err) {
		t.Fatalf("expected the replaced session to be gone, got %v", err)
	}
	if _, err := os.Stat(firstSession.WorkspacePath); !os.IsNotExist(err) {
		t.Fatalf("the replaced review left files behind at %s", firstSession.WorkspacePath)
	}
}

func TestFinishAppliesTheResultWhenTheDestinationIsCheckedOutNowhere(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(repo, false)
	if snapshot.State != integrationStateReady {
		t.Fatalf("expected ready, got %q (%s)", snapshot.State, snapshot.Error)
	}
	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}

	result := service.FinishSession(snapshot.SessionID)
	if !result.Success {
		t.Fatalf("finish failed: %s", result.Error)
	}

	if got := revParse(t, repo, "refs/heads/main"); got != session.ResultOID {
		t.Fatalf("destination is at %s, expected %s", got, session.ResultOID)
	}
	// The user is left exactly where they were working.
	if branch := strings.TrimSpace(runGitOutput(t, repo, "rev-parse", "--abbrev-ref", "HEAD")); branch != "feature" {
		t.Fatalf("the user was moved to %q", branch)
	}
	if status := strings.TrimSpace(runGitOutput(t, repo, "status", "--porcelain")); status != "" {
		t.Fatalf("the open project is dirty after finishing:\n%s", status)
	}
	if _, err := os.Stat(session.WorkspacePath); !os.IsNotExist(err) {
		t.Fatalf("finishing left review files behind at %s", session.WorkspacePath)
	}
}

func TestFinishAppliesIntoACheckedOutDestination(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(repo, false)
	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}

	// The user switches to the destination before finishing, so the ref, the
	// staged state, and the files on disk all have to move together.
	runGitCmd(t, repo, "checkout", "main")

	if result := service.FinishSession(snapshot.SessionID); !result.Success {
		t.Fatalf("finish failed: %s", result.Error)
	}

	if got := revParse(t, repo, "HEAD"); got != session.ResultOID {
		t.Fatalf("HEAD is at %s, expected %s", got, session.ResultOID)
	}
	if got := revParse(t, repo, "refs/heads/main"); got != session.ResultOID {
		t.Fatalf("destination is at %s, expected %s", got, session.ResultOID)
	}
	if status := strings.TrimSpace(runGitOutput(t, repo, "status", "--porcelain")); status != "" {
		t.Fatalf("expected a clean project after finishing:\n%s", status)
	}
	content, err := os.ReadFile(filepath.Join(repo, "feature.txt"))
	if err != nil || string(content) != "from feature\n" {
		t.Fatalf("working files do not match the result: %q, %v", string(content), err)
	}
}

func TestFinishStopsWhenAnotherWorkingCopyOwnsTheDestination(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newLinkedWorktreeRepo(t)
	commitFileAt(t, fixture.linkedWorktree, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(fixture.linkedWorktree, false)
	if snapshot.State != integrationStateReady {
		t.Fatalf("expected ready, got %q (%s)", snapshot.State, snapshot.Error)
	}
	destinationBefore := revParse(t, fixture.openProject, "refs/heads/main")

	result := service.FinishSession(snapshot.SessionID)
	if result.Success {
		t.Fatal("expected finish to stop while another working copy owns the destination")
	}
	if got := revParse(t, fixture.openProject, "refs/heads/main"); got != destinationBefore {
		t.Fatalf("destination moved to %s despite the refusal", got)
	}

	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if session.State != integrationStateBlocked {
		t.Fatalf("expected blocked, got %q", session.State)
	}
	if session.ResultOID == "" {
		t.Fatal("the prepared result must survive a refusal so finishing can be retried")
	}
}

func TestFinishRefusesWhenTheSavedWorkChanged(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(repo, false)
	destinationBefore := revParse(t, repo, "refs/heads/main")

	commitFileAt(t, repo, "feature.txt", "changed again\n", "second feature edit")

	result := service.FinishSession(snapshot.SessionID)
	if result.Success {
		t.Fatal("expected finish to refuse a stale result")
	}
	if result.Error != integrationSessionOutcomeMessages[integrationStateObsolete] {
		t.Fatalf("unexpected message: %s", result.Error)
	}
	if got := revParse(t, repo, "refs/heads/main"); got != destinationBefore {
		t.Fatalf("destination moved to %s despite the refusal", got)
	}
}

func TestCancelSessionIsIdempotentAndLeavesNothingBehind(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(repo, false)
	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	destinationBefore := revParse(t, repo, "refs/heads/main")

	for attempt := 1; attempt <= 2; attempt++ {
		if result := service.CancelSession(snapshot.SessionID); !result.Success {
			t.Fatalf("cancel attempt %d failed: %s", attempt, result.Error)
		}
	}

	if _, err := os.Stat(session.WorkspacePath); !os.IsNotExist(err) {
		t.Fatalf("cancelling left files behind at %s", session.WorkspacePath)
	}
	ref, err := integrationResultRef(snapshot.SessionID)
	if err != nil {
		t.Fatalf("result ref: %v", err)
	}
	if _, err := runGitAllowFail(t, repo, "rev-parse", "--verify", ref); err == nil {
		t.Fatal("cancelling left the prepared result behind")
	}
	if got := revParse(t, repo, "refs/heads/main"); got != destinationBefore {
		t.Fatalf("cancelling moved the destination to %s", got)
	}
	if worktrees := runGitOutput(t, repo, "worktree", "list", "--porcelain"); strings.Contains(worktrees, session.WorkspacePath) {
		t.Fatalf("cancelling left a working copy registered:\n%s", worktrees)
	}
}

func TestRecoverSessionsFlagsAReviewWhoseFilesAreGone(t *testing.T) {
	service := newTestIntegrationService(t)
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "from feature\n", "feature edit")

	snapshot := service.PrepareReadiness(repo, false)
	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	destinationBefore := revParse(t, repo, "refs/heads/main")

	// Simulate the OS clearing the cache directory out from under us.
	if err := os.RemoveAll(session.WorkspacePath); err != nil {
		t.Fatalf("remove workspace: %v", err)
	}

	if result := service.RecoverSessions(); !result.Success {
		t.Fatalf("recovery failed: %s", result.Error)
	}

	recovered := service.GetSessionState(snapshot.SessionID)
	if recovered.State != integrationStateFailed {
		t.Fatalf("expected failed, got %q", recovered.State)
	}
	if recovered.Error == "" {
		t.Fatal("expected a reason the user can read")
	}
	if got := revParse(t, repo, "refs/heads/main"); got != destinationBefore {
		t.Fatalf("recovery moved the destination to %s", got)
	}
}
