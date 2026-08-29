package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

type defaultSyncFixture struct {
	local  string
	peer   string
	remote string
}

func newDefaultSyncFixture(t *testing.T) defaultSyncFixture {
	t.Helper()
	root := t.TempDir()
	remote := filepath.Join(root, "company.git")
	runGitCmd(t, root, "init", "--bare", "-b", "release", remote)

	local := createTestRepo(t)
	t.Cleanup(func() { os.RemoveAll(local) })
	runGitCmd(t, local, "config", "core.autocrlf", "false")
	commitFileAt(t, local, "shared.txt", "base\n", "base")
	runGitCmd(t, local, "branch", "-M", "local-main")
	runGitCmd(t, local, "remote", "add", "company", remote)
	runGitCmd(t, local, "push", "-u", "company", "HEAD:release")
	runGitCmd(t, local, "symbolic-ref", "refs/remotes/company/HEAD", "refs/remotes/company/release")

	peer := filepath.Join(root, "peer")
	runGitCmd(t, root, "clone", remote, peer)
	runGitCmd(t, peer, "config", "user.name", "Peer User")
	runGitCmd(t, peer, "config", "user.email", "peer@example.com")
	runGitCmd(t, peer, "config", "core.autocrlf", "false")

	return defaultSyncFixture{local: local, peer: peer, remote: remote}
}

func (f defaultSyncFixture) createConflict(t *testing.T) (localOID string, remoteOID string) {
	t.Helper()
	localOID = commitFileAt(t, f.local, "shared.txt", "current\n", "local change")
	remoteOID = commitFileAt(t, f.peer, "shared.txt", "incoming\n", "remote change")
	runGitCmd(t, f.peer, "push", "origin", "release")
	return localOID, remoteOID
}

func pullExpectingConflict(t *testing.T, repo string) {
	t.Helper()
	if output, err := runGitAllowFail(t, repo, "pull", "--no-rebase"); err == nil {
		t.Fatalf("expected pull conflict, got success:\n%s", output)
	}
}

func TestDefaultBranchSyncAdoptsConflictAndSharesExplicitRef(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	localOID, remoteOID := fixture.createConflict(t)

	if !service.IsDefaultBranchSyncEligible(fixture.local) {
		t.Fatal("expected local-main tracking company/release to be eligible")
	}
	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || !eligible || sessionID == "" {
		t.Fatalf("begin default sync: id=%q eligible=%v err=%v", sessionID, eligible, err)
	}
	pullExpectingConflict(t, fixture.local)
	needsDecisions, err := service.ReconcileSyncPull(sessionID)
	if err != nil || !needsDecisions {
		t.Fatalf("reconcile pull: needs=%v err=%v", needsDecisions, err)
	}

	snapshot := service.GetSessionState(sessionID)
	if snapshot.State != integrationStateNeedsDecisions || snapshot.UpdateKind != integrationUpdateKindDefaultSync {
		t.Fatalf("unexpected adopted session: %+v", snapshot)
	}
	if snapshot.SourceBranch != "local-main" || snapshot.TargetBranch != "release" {
		t.Fatalf("expected custom branch mapping, got source=%q target=%q", snapshot.SourceBranch, snapshot.TargetBranch)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != remoteOID {
		t.Fatalf("conflicted Sync pushed automatically: remote=%s want=%s", got, remoteOID)
	}

	if result := service.ResolveSessionConflictWithSide(sessionID, "shared.txt", integrationSideTheirs); !result.Success {
		t.Fatalf("resolve incoming: %s", result.Error)
	}
	updated := service.GetSessionState(sessionID)
	if updated.State != integrationStateUpdated {
		t.Fatalf("expected updated after final decision, got %+v", updated)
	}
	resultOID := revParse(t, fixture.local, "HEAD")
	parents := parentsOf(t, fixture.local, resultOID)
	if len(parents) != 2 || parents[0] != localOID || parents[1] != remoteOID {
		t.Fatalf("unexpected default Sync topology: %v", parents)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != remoteOID {
		t.Fatalf("resolution pushed automatically: remote=%s want=%s", got, remoteOID)
	}

	if result := service.ShareSession(sessionID); !result.Success {
		t.Fatalf("explicit share failed: %s", result.Error)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != resultOID {
		t.Fatalf("ShareSession did not update company/release: got=%s want=%s", got, resultOID)
	}
}

func TestProgressDefaultBranchSyncReturnsStructuredDecisionOutcome(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	_, remoteOID := fixture.createConflict(t)
	progress := NewProgressService(service)
	progress.SetRepoEventBus(NewRepoEventBus())

	result := progress.SyncWithProgress(fixture.local, "default-sync-conflict", false, false)
	if result.Success || result.Outcome != syncOutcomeNeedsDecisions {
		t.Fatalf("expected structured needs-decisions outcome, got %+v", result)
	}
	sessions := service.ListSessions(fixture.local)
	if len(sessions) != 1 || sessions[0].State != integrationStateNeedsDecisions {
		t.Fatalf("expected one persisted conflict session, got %+v", sessions)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != remoteOID {
		t.Fatalf("ProgressService pushed after conflict: remote=%s want=%s", got, remoteOID)
	}
}

func TestDefaultBranchSyncCancelRestoresCapturedRevision(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	localOID, _ := fixture.createConflict(t)

	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || !eligible {
		t.Fatalf("begin default sync: eligible=%v err=%v", eligible, err)
	}
	pullExpectingConflict(t, fixture.local)
	if needs, err := service.ReconcileSyncPull(sessionID); err != nil || !needs {
		t.Fatalf("reconcile pull: needs=%v err=%v", needs, err)
	}
	if result := service.CancelSession(sessionID); !result.Success {
		t.Fatalf("cancel default Sync: %s", result.Error)
	}
	if got := revParse(t, fixture.local, "HEAD"); got != localOID {
		t.Fatalf("cancel restored %s, want %s", got, localOID)
	}
	if status := strings.TrimSpace(runGitOutput(t, fixture.local, "status", "--porcelain")); status != "" {
		t.Fatalf("cancel left project dirty:\n%s", status)
	}
}

func TestDefaultBranchSyncShareUsesResolvedPushRemote(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	_, upstreamOID := fixture.createConflict(t)
	publishRemote := filepath.Join(t.TempDir(), "publish.git")
	runGitCmd(t, filepath.Dir(publishRemote), "init", "--bare", publishRemote)
	runGitCmd(t, fixture.local, "remote", "add", "publish", publishRemote)
	runGitCmd(t, fixture.local, "config", "branch.local-main.pushRemote", "publish")
	runGitCmd(t, fixture.local, "config", "push.default", "current")

	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || !eligible {
		t.Fatalf("begin default sync: eligible=%v err=%v", eligible, err)
	}
	persisted, err := service.store.load(sessionID)
	if err != nil {
		t.Fatal(err)
	}
	if persisted.RemoteName != "publish" || persisted.ShareRef != "refs/heads/local-main" {
		t.Fatalf("unexpected resolved push target: remote=%q ref=%q", persisted.RemoteName, persisted.ShareRef)
	}
	pullExpectingConflict(t, fixture.local)
	if needs, err := service.ReconcileSyncPull(sessionID); err != nil || !needs {
		t.Fatalf("reconcile pull: needs=%v err=%v", needs, err)
	}
	if result := service.ResolveSessionConflictWithSide(sessionID, "shared.txt", integrationSideTheirs); !result.Success {
		t.Fatalf("resolve incoming: %s", result.Error)
	}
	if result := service.ShareSession(sessionID); !result.Success {
		t.Fatalf("share to pushRemote: %s", result.Error)
	}
	resultOID := revParse(t, fixture.local, "HEAD")
	if got := strings.TrimSpace(runGitOutput(t, publishRemote, "rev-parse", "refs/heads/local-main")); got != resultOID {
		t.Fatalf("pushRemote received %s, want %s", got, resultOID)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != upstreamOID {
		t.Fatalf("explicit share unexpectedly updated pull remote: got=%s want=%s", got, upstreamOID)
	}
}

func TestDefaultBranchSyncRestartReconcilesCapturedConflict(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	fixture.createConflict(t)

	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || !eligible {
		t.Fatalf("begin default sync: eligible=%v err=%v", eligible, err)
	}
	pullExpectingConflict(t, fixture.local)

	restarted := &IntegrationSessionService{
		git:       NewCommandRunner(),
		target:    NewGitService(),
		store:     service.store,
		preparing: map[string]bool{},
		scheduled: map[string]*time.Timer{},
	}
	if result := restarted.RecoverSessions(); !result.Success {
		t.Fatalf("recover sessions: %s", result.Error)
	}
	if snapshot := restarted.GetSessionState(sessionID); snapshot.State != integrationStateNeedsDecisions {
		t.Fatalf("restart did not adopt captured conflict: %+v", snapshot)
	}
}

func TestDefaultBranchSyncRestartResumesAfterConflictFreePull(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	commitFileAt(t, fixture.local, "local.txt", "local\n", "local change")
	upstreamOID := commitFileAt(t, fixture.peer, "remote.txt", "remote\n", "remote change")
	runGitCmd(t, fixture.peer, "push", "origin", "release")

	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || !eligible {
		t.Fatalf("begin default sync: eligible=%v err=%v", eligible, err)
	}
	runGitCmd(t, fixture.local, "pull", "--no-rebase")
	resultOID := revParse(t, fixture.local, "HEAD")
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != upstreamOID {
		t.Fatalf("test setup pushed local merge unexpectedly: got=%s want=%s", got, upstreamOID)
	}

	if result := service.RecoverSessions(); !result.Success {
		t.Fatalf("recover sessions: %s", result.Error)
	}
	if snapshot := service.GetSessionState(sessionID); snapshot.State != integrationStateUpdated {
		t.Fatalf("restart did not preserve conflict-free pull for explicit share: %+v", snapshot)
	}
	if result := service.ShareSession(sessionID); !result.Success {
		t.Fatalf("share resumed Sync: %s", result.Error)
	}
	if got := strings.TrimSpace(runGitOutput(t, fixture.remote, "rev-parse", "refs/heads/release")); got != resultOID {
		t.Fatalf("resumed share pushed %s, want %s", got, resultOID)
	}
}

func TestFeatureBranchSyncRemainsOutsideDefaultSessionLifecycle(t *testing.T) {
	service := newTestIntegrationService(t)
	fixture := newDefaultSyncFixture(t)
	runGitCmd(t, fixture.local, "checkout", "-b", "feature")
	runGitCmd(t, fixture.local, "push", "-u", "company", "feature")

	if service.IsDefaultBranchSyncEligible(fixture.local) {
		t.Fatal("feature branch must not be eligible for default Sync adoption")
	}
	sessionID, eligible, err := service.BeginDefaultBranchSync(fixture.local)
	if err != nil || eligible || sessionID != "" {
		t.Fatalf("feature branch unexpectedly created a session: id=%q eligible=%v err=%v", sessionID, eligible, err)
	}
}
