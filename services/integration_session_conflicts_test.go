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
	service, fixture, snapshot := needsDecisionsFixture(t)

	data := service.GetSessionConflictResolutionData(snapshot.SessionID, "shared.txt")

	if !data.Success || !data.Eligible {
		t.Fatalf("expected an eligible conflict, got %+v", data)
	}
	if data.ResolutionToken == "" || len(data.Regions) == 0 {
		t.Fatalf("expected regions and a token, got %+v", data)
	}
	current := runGitOutput(t, fixture.openProject, "show", data.Current.OID)
	incoming := runGitOutput(t, fixture.openProject, "show", data.Incoming.OID)
	if current != "line\nfeature\n" || incoming != "line\nmain\n" {
		t.Fatalf("expected Current to be feature and Incoming to be main, got current %q incoming %q", current, incoming)
	}
}

func TestSessionWholeFileChoicesUseProductSideSemantics(t *testing.T) {
	tests := []struct {
		name        string
		side        string
		wantContent string
	}{
		{name: "current keeps feature", side: integrationSideMine, wantContent: "line\nfeature\n"},
		{name: "incoming keeps destination", side: integrationSideTheirs, wantContent: "line\nmain\n"},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			service, fixture, snapshot := needsDecisionsFixture(t)

			result := service.ResolveSessionConflictWithSide(snapshot.SessionID, "shared.txt", test.side)
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
			if content := runGitOutput(t, fixture.openProject, "show", session.ResultOID+":shared.txt"); content != test.wantContent {
				t.Fatalf("prepared result contains %q, expected %q", content, test.wantContent)
			}
			assertResultUnreachable(t, fixture.openProject, session.ResultOID)

			for _, path := range []string{fixture.openProject, fixture.linkedWorktree} {
				if status := strings.TrimSpace(runGitOutput(t, path, "status", "--porcelain")); status != "" {
					t.Fatalf("a decision changed the user's project %s:\n%s", path, status)
				}
			}
		})
	}
}

func TestSessionSectionChoiceKeepsCurrentFeatureContent(t *testing.T) {
	service, fixture, snapshot := needsDecisionsFixture(t)
	data := service.GetSessionConflictResolutionData(snapshot.SessionID, "shared.txt")
	if len(data.Regions) != 1 {
		t.Fatalf("expected one conflict region, got %+v", data.Regions)
	}

	result := service.ResolveSessionConflictWithDecisions(snapshot.SessionID, "shared.txt", data.ResolutionToken, []ConflictDecision{{
		RegionID: data.Regions[0].ID,
		Mode:     "block",
		Side:     "current",
	}})
	if !result.Success {
		t.Fatalf("resolve failed: %s", result.Error)
	}

	session, err := service.store.load(snapshot.SessionID)
	if err != nil {
		t.Fatalf("load session: %v", err)
	}
	if content := runGitOutput(t, fixture.openProject, "show", session.ResultOID+":shared.txt"); content != "line\nfeature\n" {
		t.Fatalf("prepared result contains %q, expected feature content", content)
	}
}

func TestIntegrationConflictQueueUsesProductSideSemantics(t *testing.T) {
	tests := []struct {
		gitKind     ConflictKind
		productKind ConflictKind
	}{
		{gitKind: ConflictKindAddedByUs, productKind: ConflictKindAddedByThem},
		{gitKind: ConflictKindAddedByThem, productKind: ConflictKindAddedByUs},
		{gitKind: ConflictKindDeletedByUs, productKind: ConflictKindDeletedByThem},
		{gitKind: ConflictKindDeletedByThem, productKind: ConflictKindDeletedByUs},
	}

	for _, test := range tests {
		entry := integrationConflictQueueEntry(ConflictQueueEntry{
			Kind:      test.gitKind,
			HasOurs:   true,
			HasTheirs: false,
		})
		if entry.Kind != test.productKind || entry.HasOurs || !entry.HasTheirs {
			t.Fatalf("Git kind %q translated to %+v, expected kind %q with sides swapped", test.gitKind, entry, test.productKind)
		}
	}
}

func TestIntegrationConflictDecisionsUseGitStageSemantics(t *testing.T) {
	decisions := []ConflictDecision{{
		RegionID:      "region-1",
		Mode:          "lines",
		Side:          "current",
		CurrentLines:  []bool{true, false},
		IncomingLines: []bool{false, true},
	}}

	translated := integrationConflictDecisions(decisions)
	if translated[0].Side != "incoming" ||
		!translated[0].CurrentLines[1] || translated[0].CurrentLines[0] ||
		!translated[0].IncomingLines[0] || translated[0].IncomingLines[1] {
		t.Fatalf("unexpected translated decision: %+v", translated[0])
	}
	if decisions[0].Side != "current" || !decisions[0].CurrentLines[0] {
		t.Fatalf("input decision was mutated: %+v", decisions[0])
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
