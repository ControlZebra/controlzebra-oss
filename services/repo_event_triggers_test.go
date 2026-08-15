package services

import (
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

// recordingBus collects published events for assertions.
type recordingBus struct {
	mu     sync.Mutex
	events []RepoMutated
	signal chan struct{}
}

func newRecordingBus() (*RepoEventBus, *recordingBus) {
	bus := NewRepoEventBus()
	recorder := &recordingBus{signal: make(chan struct{}, 16)}
	bus.Subscribe(func(event RepoMutated) {
		recorder.mu.Lock()
		recorder.events = append(recorder.events, event)
		recorder.mu.Unlock()
		select {
		case recorder.signal <- struct{}{}:
		default:
		}
	})
	return bus, recorder
}

func (r *recordingBus) waitForEvent(t *testing.T, timeout time.Duration) RepoMutated {
	t.Helper()

	select {
	case <-r.signal:
	case <-time.After(timeout):
		t.Fatal("expected a repository mutation event")
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	return r.events[len(r.events)-1]
}

// A sync that fails is exactly how conflicts appear, so the mutation must be
// published even when the operation reports failure.
func TestSyncWithProgressPublishesRepoMutation(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)

	bus, recorder := newRecordingBus()
	progress := NewProgressService()
	progress.SetRepoEventBus(bus)

	progress.SyncWithProgress(repoPath, "op-1", false, false)

	event := recorder.waitForEvent(t, time.Second)
	if event.RepoPath != repoPath || event.Reason != RepoMutationPull {
		t.Fatalf("unexpected event %+v", event)
	}
}

func TestFileWatcherPublishesRepoMutation(t *testing.T) {
	watchPath := t.TempDir()

	bus, recorder := newRecordingBus()
	watcher := NewFileWatcherService()
	watcher.SetRepoEventBus(bus)

	if result := watcher.WatchDirectory(watchPath); !result.Success {
		t.Fatalf("failed to watch directory: %s", result.Error)
	}
	defer watcher.StopWatching()

	if err := os.WriteFile(filepath.Join(watchPath, "changed.txt"), []byte("x"), 0o600); err != nil {
		t.Fatalf("failed to write file: %v", err)
	}

	event := recorder.waitForEvent(t, 5*time.Second)
	if event.RepoPath != watchPath {
		t.Fatalf("unexpected event %+v", event)
	}
}
