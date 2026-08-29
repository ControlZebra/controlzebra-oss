package services

import (
	"testing"
	"time"
)

// Phase 4 of the Isolated Conflict Resolution Plan: saving schedules the check.

type stubIntegrationSettings struct {
	developerMode bool
	reads         int
}

func (s *stubIntegrationSettings) GetAppSettings() AppSettings {
	s.reads++
	return AppSettings{DeveloperModeEnabled: s.developerMode}
}

// newScheduledIntegrationService replaces the debounce timer with a captured
// callback, so tests decide when the scheduled work runs instead of waiting.
func newScheduledIntegrationService(t *testing.T, developerMode bool) (*IntegrationSessionService, *stubIntegrationSettings, func() int, func()) {
	t.Helper()
	service := newTestIntegrationService(t)
	settings := &stubIntegrationSettings{developerMode: developerMode}
	service.settings = settings

	pending := []func(){}
	service.afterFunc = func(_ time.Duration, run func()) *time.Timer {
		pending = append(pending, run)
		return time.AfterFunc(time.Hour, func() {})
	}

	count := func() int { return len(pending) }
	runAll := func() {
		for _, run := range pending {
			run()
		}
		pending = nil
	}
	return service, settings, count, runAll
}

func TestSavingSchedulesOneCheckForABurstOfSaves(t *testing.T) {
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "work\n", "work")

	service, _, scheduledCount, runScheduled := newScheduledIntegrationService(t, true)
	bus := NewRepoEventBus()
	service.AttachToBus(bus)
	defer service.DetachFromBus()

	bus.Publish(RepoMutated{RepoPath: repo, Reason: RepoMutationCommit})
	bus.Publish(RepoMutated{RepoPath: repo, Reason: RepoMutationCommit})
	bus.Publish(RepoMutated{RepoPath: repo, Reason: RepoMutationCommit})

	// Each save replaces the previous timer, so only the last one survives.
	if got := len(service.scheduled); got != 1 {
		t.Fatalf("expected 1 pending check, got %d", got)
	}
	if got := scheduledCount(); got != 3 {
		t.Fatalf("expected 3 timers created, got %d", got)
	}

	runScheduled()

	sessions := service.ListSessions(repo)
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session after the scheduled check, got %d", len(sessions))
	}
	if sessions[0].State != integrationStateReady {
		t.Fatalf("expected the check to reach %q, got %q", integrationStateReady, sessions[0].State)
	}
	if len(service.scheduled) != 0 {
		t.Fatalf("expected the timer to be cleared after running")
	}
}

func TestSavingSchedulesNothingWhenDeveloperModeIsOff(t *testing.T) {
	repo := newFeatureBranchRepo(t)
	commitFileAt(t, repo, "feature.txt", "work\n", "work")

	service, settings, _, runScheduled := newScheduledIntegrationService(t, false)
	bus := NewRepoEventBus()
	service.AttachToBus(bus)
	defer service.DetachFromBus()

	bus.Publish(RepoMutated{RepoPath: repo, Reason: RepoMutationCommit})
	runScheduled()

	if settings.reads == 0 {
		t.Fatal("expected the flag to be read on every trigger")
	}
	if sessions := service.ListSessions(repo); len(sessions) != 0 {
		t.Fatalf("expected no session with developer mode off, got %d", len(sessions))
	}
}

func TestOnlySavingSchedulesACheck(t *testing.T) {
	service, _, _, _ := newScheduledIntegrationService(t, true)
	bus := NewRepoEventBus()
	service.AttachToBus(bus)
	defer service.DetachFromBus()

	for _, reason := range []RepoMutationReason{RepoMutationWorkingTree, RepoMutationCheckout, RepoMutationPull, RepoMutationMerge} {
		bus.Publish(RepoMutated{RepoPath: "/repo", Reason: reason})
	}

	if len(service.scheduled) != 0 {
		t.Fatalf("expected no check scheduled, got %d", len(service.scheduled))
	}
}

func TestDetachingFromTheBusStopsScheduling(t *testing.T) {
	service, _, _, _ := newScheduledIntegrationService(t, true)
	bus := NewRepoEventBus()
	service.AttachToBus(bus)
	service.DetachFromBus()

	bus.Publish(RepoMutated{RepoPath: "/repo", Reason: RepoMutationCommit})

	if len(service.scheduled) != 0 {
		t.Fatalf("expected no check scheduled after detaching, got %d", len(service.scheduled))
	}
}
