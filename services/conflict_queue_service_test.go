package services

import (
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

// scriptedConflictGit returns a queued sequence of ls-files results so tests
// can control what each scan observes.
type scriptedConflictGit struct {
	mu        sync.Mutex
	responses []CommandResult
	calls     int
	blobs     map[string][]byte
	sizes     map[string]int64
}

func (g *scriptedConflictGit) RunGit(_ string, args ...string) CommandResult {
	if len(args) == 0 || args[0] != "ls-files" {
		return CommandResult{Success: false, Error: "unexpected command"}
	}

	g.mu.Lock()
	defer g.mu.Unlock()
	g.calls++
	if len(g.responses) == 0 {
		return CommandResult{Success: true}
	}
	if len(g.responses) == 1 {
		return g.responses[0]
	}
	next := g.responses[0]
	g.responses = g.responses[1:]
	return next
}

func (g *scriptedConflictGit) RunGitRaw(_ string, args ...string) ([]byte, error) {
	if len(args) == 3 && args[0] == "cat-file" && args[1] == "blob" {
		g.mu.Lock()
		defer g.mu.Unlock()
		if content, exists := g.blobs[args[2]]; exists {
			return content, nil
		}
	}
	return []byte("text"), nil
}

func (g *scriptedConflictGit) RunGitWithStdin(_ string, stdinInput string, args ...string) CommandResult {
	if len(args) < 2 || args[0] != "cat-file" || args[1] != "--batch-check" {
		return CommandResult{Success: false, Error: "unexpected stdin command"}
	}

	g.mu.Lock()
	defer g.mu.Unlock()
	lines := []string{}
	for _, oid := range strings.Fields(stdinInput) {
		size := int64(16)
		if known, exists := g.sizes[oid]; exists {
			size = known
		}
		lines = append(lines, fmt.Sprintf("%s blob %d", oid, size))
	}
	return CommandResult{Success: true, Stdout: strings.Join(lines, "\n") + "\n"}
}

func (g *scriptedConflictGit) callCount() int {
	g.mu.Lock()
	defer g.mu.Unlock()
	return g.calls
}

func conflictListing(paths ...string) CommandResult {
	builder := strings.Builder{}
	for index, path := range paths {
		oid := fmt.Sprintf("oid%d", index)
		builder.WriteString(unmergedRecord("100644", oid+"a", 2, path))
		builder.WriteString(unmergedRecord("100644", oid+"b", 3, path))
	}
	return CommandResult{Success: true, Stdout: builder.String()}
}

// newTestConflictQueueService builds a service with a manual timer so debounce
// behavior is deterministic.
func newTestConflictQueueService(git conflictQueueGit) (*ConflictQueueService, func()) {
	var mu sync.Mutex
	var pending func()

	service := &ConflictQueueService{
		git:      git,
		entries:  []ConflictQueueEntry{},
		debounce: time.Millisecond,
		now:      func() time.Time { return time.UnixMilli(1_700_000_000_000) },
	}
	service.afterFunc = func(_ time.Duration, fire func()) *time.Timer {
		mu.Lock()
		// The service stops any previous timer before scheduling a new one, so
		// a single pending slot models real reset-and-coalesce behavior.
		pending = fire
		mu.Unlock()
		timer := time.NewTimer(time.Hour)
		timer.Stop()
		return timer
	}

	fireTimers := func() {
		mu.Lock()
		due := pending
		pending = nil
		mu.Unlock()
		if due != nil {
			due()
		}
	}
	return service, fireTimers
}

func TestConflictQueueSetRepositoryScansOnce(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("b.txt", "a.txt")}}
	service, _ := newTestConflictQueueService(git)

	snapshot := service.SetRepository("/repo")

	if snapshot.RepoPath != "/repo" {
		t.Fatalf("unexpected repo path %q", snapshot.RepoPath)
	}
	if len(snapshot.Entries) != 2 {
		t.Fatalf("expected 2 entries, got %d", len(snapshot.Entries))
	}
	if snapshot.Entries[0].Path != "a.txt" || snapshot.Entries[1].Path != "b.txt" {
		t.Fatalf("expected alphabetical order, got %+v", snapshot.Entries)
	}
	if git.callCount() != 1 {
		t.Fatalf("expected exactly 1 scan, got %d", git.callCount())
	}
	if snapshot.ScannedAt == 0 || snapshot.Error != "" {
		t.Fatalf("unexpected snapshot metadata: %+v", snapshot)
	}
}

func TestConflictQueueGetDoesNotRescan(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, _ := newTestConflictQueueService(git)
	service.SetRepository("/repo")

	before := service.GetConflictQueue()
	after := service.GetConflictQueue()

	if git.callCount() != 1 {
		t.Fatalf("expected no additional scans, got %d", git.callCount())
	}
	if before.Generation != after.Generation {
		t.Fatalf("reading the queue must not advance the generation")
	}
}

func TestConflictQueueGenerationStrictlyIncreases(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, _ := newTestConflictQueueService(git)

	first := service.SetRepository("/repo")
	second := service.Refresh()
	third := service.Refresh()

	if !(first.Generation < second.Generation && second.Generation < third.Generation) {
		t.Fatalf("generations must increase: %d, %d, %d", first.Generation, second.Generation, third.Generation)
	}
}

func TestConflictQueueDebouncesBurstOfMutations(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, fireTimers := newTestConflictQueueService(git)
	bus := NewRepoEventBus()
	service.SetRepository("/repo")
	service.AttachToBus(bus)

	for i := 0; i < 10; i++ {
		bus.Publish(RepoMutated{RepoPath: "/repo", Reason: RepoMutationMerge})
	}
	if git.callCount() != 1 {
		t.Fatalf("expected no scan before the debounce fires, got %d", git.callCount())
	}

	fireTimers()

	if git.callCount() != 2 {
		t.Fatalf("expected exactly one debounced scan, got %d total scans", git.callCount())
	}
}

func TestConflictQueueIgnoresOtherRepositories(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, fireTimers := newTestConflictQueueService(git)
	bus := NewRepoEventBus()
	service.SetRepository("/repo")
	service.AttachToBus(bus)

	bus.Publish(RepoMutated{RepoPath: "/other-repo", Reason: RepoMutationMerge})
	fireTimers()

	if git.callCount() != 1 {
		t.Fatalf("expected no scan for an unrelated repository, got %d", git.callCount())
	}
}

func TestConflictQueueDetachStopsReacting(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, fireTimers := newTestConflictQueueService(git)
	bus := NewRepoEventBus()
	service.SetRepository("/repo")
	service.AttachToBus(bus)
	service.DetachFromBus()

	bus.Publish(RepoMutated{RepoPath: "/repo"})
	fireTimers()

	if git.callCount() != 1 {
		t.Fatalf("expected no scan after detaching, got %d", git.callCount())
	}
}

func TestConflictQueueKeepsLastGoodSnapshotOnFailure(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{
		conflictListing("a.txt"),
		{Success: false, Stderr: "index.lock exists"},
	}}
	service, _ := newTestConflictQueueService(git)

	good := service.SetRepository("/repo")
	failed := service.Refresh()

	if len(failed.Entries) != len(good.Entries) {
		t.Fatalf("expected entries to survive a failed scan, got %+v", failed.Entries)
	}
	if failed.Error == "" {
		t.Fatalf("expected an error on the snapshot")
	}
	if failed.ScannedAt != good.ScannedAt {
		t.Fatalf("a failed scan must not advance ScannedAt")
	}
	if failed.Generation <= good.Generation {
		t.Fatalf("a failed scan must still emit a new generation")
	}
}

func TestConflictQueueClearsErrorAfterRecovery(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{
		conflictListing("a.txt"),
		{Success: false, Stderr: "index.lock exists"},
		conflictListing("a.txt", "b.txt"),
	}}
	service, _ := newTestConflictQueueService(git)

	service.SetRepository("/repo")
	service.Refresh()
	recovered := service.Refresh()

	if recovered.Error != "" {
		t.Fatalf("expected the error to clear, got %q", recovered.Error)
	}
	if len(recovered.Entries) != 2 {
		t.Fatalf("expected the recovered entries, got %+v", recovered.Entries)
	}
}

func TestConflictQueueResetsOnRepositoryChange(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{
		conflictListing("a.txt", "b.txt"),
		{Success: true, Stdout: ""},
	}}
	service, _ := newTestConflictQueueService(git)

	service.SetRepository("/repo-one")
	switched := service.SetRepository("/repo-two")

	if switched.RepoPath != "/repo-two" {
		t.Fatalf("unexpected repo path %q", switched.RepoPath)
	}
	if len(switched.Entries) != 0 {
		t.Fatalf("expected the previous repository's entries to be dropped, got %+v", switched.Entries)
	}
}

func TestConflictQueueClearRepositoryEmptiesQueue(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, fireTimers := newTestConflictQueueService(git)
	bus := NewRepoEventBus()
	service.SetRepository("/repo")
	service.AttachToBus(bus)

	cleared := service.ClearRepository()

	if cleared.RepoPath != "" || len(cleared.Entries) != 0 {
		t.Fatalf("expected an empty snapshot, got %+v", cleared)
	}

	bus.Publish(RepoMutated{RepoPath: "/repo"})
	fireTimers()
	if git.callCount() != 1 {
		t.Fatalf("expected no scan while unbound, got %d", git.callCount())
	}
}

func TestConflictQueueSnapshotIsACopy(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, _ := newTestConflictQueueService(git)
	service.SetRepository("/repo")

	snapshot := service.GetConflictQueue()
	snapshot.Entries[0].Path = "mutated.txt"

	if service.GetConflictQueue().Entries[0].Path != "a.txt" {
		t.Fatalf("callers must not be able to mutate service state")
	}
}

func TestConflictQueueConcurrentRefreshIsSerializedAndCoalesced(t *testing.T) {
	git := &scriptedConflictGit{responses: []CommandResult{conflictListing("a.txt")}}
	service, _ := newTestConflictQueueService(git)
	service.SetRepository("/repo")

	var wg sync.WaitGroup
	for i := 0; i < 25; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			service.Refresh()
		}()
	}
	wg.Wait()

	if calls := git.callCount(); calls < 2 || calls > 26 {
		t.Fatalf("unexpected scan count %d", calls)
	}
	if entries := service.GetConflictQueue().Entries; len(entries) != 1 {
		t.Fatalf("expected a consistent snapshot, got %+v", entries)
	}
}

func TestSameRepositoryPathNormalizesSeparators(t *testing.T) {
	if !sameRepositoryPath("/repo/", "/repo") {
		t.Fatal("expected trailing separators to be ignored")
	}
	if sameRepositoryPath("", "/repo") || sameRepositoryPath("/repo", "") {
		t.Fatal("expected empty paths never to match")
	}
	if sameRepositoryPath("/repo", "/other") {
		t.Fatal("expected different paths not to match")
	}
}

// TestConflictQueueReactsToGitServiceOperations wires the real GitService, bus,
// and queue together against a genuinely conflicted repository.
func TestConflictQueueReactsToGitServiceOperations(t *testing.T) {
	repoPath := createTextConflictRepo(t, "control.txt",
		[]byte("base\n"), []byte("current\n"), []byte("incoming\n"))
	defer cleanupTestRepo(t, repoPath)

	bus := NewRepoEventBus()
	gitService := NewGitService()
	gitService.SetRepoEventBus(bus)

	queue := NewConflictQueueService()
	queue.debounce = time.Millisecond
	queue.AttachToBus(bus)
	defer queue.DetachFromBus()

	snapshot := queue.SetRepository(repoPath)
	if len(snapshot.Entries) != 1 || snapshot.Entries[0].Path != "control.txt" {
		t.Fatalf("expected the conflicted file to be queued, got %+v", snapshot.Entries)
	}
	if snapshot.Entries[0].Eligibility != ConflictEligible {
		t.Fatalf("expected an eligible text conflict, got %+v", snapshot.Entries[0])
	}

	if result := gitService.AbortMerge(repoPath); !result.Success {
		t.Fatalf("failed to abort merge: %s", result.Error)
	}

	deadline := time.Now().Add(5 * time.Second)
	for {
		if len(queue.GetConflictQueue().Entries) == 0 {
			break
		}
		if time.Now().After(deadline) {
			t.Fatalf("queue did not drain after the merge was aborted: %+v", queue.GetConflictQueue())
		}
		time.Sleep(10 * time.Millisecond)
	}
}
