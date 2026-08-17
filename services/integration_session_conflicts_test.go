package services

import (
	"strings"
	"testing"
)

// Phase 3 of the Isolated Conflict Resolution Plan. Decisions must land in the
// session's own workspace, and only for files the review is actually asking
// about.

// needsDecisionsFixture is a review sitting on one conflicted file.
func needsDecisionsFixture(t *testing.T) (*IntegrationSessionService, integrationFixture, IntegrationSessionSnapshot) {
	t.Helper()
	service := newTestIntegrationService(t)
	fixture := newLinkedWorktreeRepo(t)

	commitFileAt(t, fixture.openProject, "shared.txt", "line\nmain\n", "main edit")
	commitFileAt(t, fixture.linkedWorktree, "shared.txt", "line\nfeature\n", "feature edit")

	snapshot := service.PrepareReadiness(fixture.linkedWorktree, false)
	if snapshot.State != integrationStateNeedsDecisions {
		t.Fatalf("expected needs-decisions, got %q (%s)", snapshot.State, snapshot.Error)
	}
	return service, fixture, snapshot
}

func TestSessionConflictQueueListsTheFilesNeedingADecision(t *testing.T) {
	service, _, snapshot := needsDecisionsFixture(t)

	conflicts := service.GetSessionConflicts(snapshot.SessionID)

	if conflicts.SessionID != snapshot.SessionID || conflicts.Generation != snapshot.Generation {
		t.Fatalf("snapshot identity mismatch: %+v", conflicts)
	}
	if len(conflicts.Entries) != 1 || conflicts.Entries[0].Path != "shared.txt" {
		t.Fatalf("unexpected entries: %+v", conflicts.Entries)
	}
	if conflicts.Entries[0].State != ConflictStateActive {
		t.Fatalf("session entries must be real conflicts, got %q", conflicts.Entries[0].State)
	}
}

func TestSessionConflictResolutionDataLoadsWithoutARepositoryPath(t *testing.T) {
	service, _, snapshot := needsDecisionsFixture(t)

	data := service.GetSessionConflictResolutionData(snapshot.SessionID, "shared.txt")

	if !data.Success || !data.Eligible {
		t.Fatalf("expected an eligible conflict, got %+v", data)
	}
	if data.ResolutionToken == "" || len(data.Regions) == 0 {
		t.Fatalf("expected regions and a token, got %+v", data)
	}
}

func TestResolvingEverySessionConflictMakesTheReviewReady(t *testing.T) {
	service, fixture, snapshot := needsDecisionsFixture(t)

	result := service.ResolveSessionConflictWithSide(snapshot.SessionID, "shared.txt", integrationSideTheirs)
	if !result.Success {
		t.Fatalf("resolve failed: %s", result.Error)
	}

	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if session.State != integrationStateReady {
		t.Fatalf("expected ready after the last decision, got %q (%s)", session.State, session.Error)
	}
	if strings.TrimSpace(session.ResultOID) == "" {
		t.Fatal("expected a prepared result")
	}
	assertResultUnreachable(t, fixture.openProject, session.ResultOID)

	for _, path := range []string{fixture.openProject, fixture.linkedWorktree} {
		if status := strings.TrimSpace(runGitOutput(t, path, "status", "--porcelain")); status != "" {
			t.Fatalf("a decision changed the user's project %s:\n%s", path, status)
		}
	}
}

func TestSessionResolutionRefusesAFileThatIsNotWaitingForADecision(t *testing.T) {
	service, _, snapshot := needsDecisionsFixture(t)

	for _, path := range []string{"untouched.txt", "../escape.txt"} {
		result := service.ResolveSessionConflictWithSide(snapshot.SessionID, path, integrationSideMine)
		if result.Success {
			t.Fatalf("expected %q to be refused", path)
		}
	}
}

func TestSessionResolutionRejectsAStaleToken(t *testing.T) {
	service, _, snapshot := needsDecisionsFixture(t)

	result := service.ResolveSessionConflictWithDecisions(snapshot.SessionID, "shared.txt", "stale-token", nil)

	if result.Success {
		t.Fatal("expected a stale token to be refused")
	}
	if !strings.Contains(result.Error+result.Message, "changed after it was opened") {
		t.Fatalf("expected the existing stale-token message, got %+v", result)
	}
}

func TestSessionConflictsAreEmptyForAnUnknownSession(t *testing.T) {
	service := newTestIntegrationService(t)

	if conflicts := service.GetSessionConflicts("deadbeefdeadbeefdeadbeefdeadbeef"); conflicts.SessionID != "" {
		t.Fatalf("expected an empty snapshot, got %+v", conflicts)
	}
}
