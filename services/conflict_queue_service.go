// Package services provides backend functionality for the ControlZebra application.
// This file contains the ConflictQueueService, the authoritative source of the
// conflicted file queue for the currently open repository.
package services

import (
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ConflictQueueChangedEvent is the frontend event carrying a full queue snapshot.
const ConflictQueueChangedEvent = "conflictQueue:changed"

// conflictQueueDebounce is the quiet period applied before a rescan runs, so a
// burst of repository mutations produces a single scan.
const conflictQueueDebounce = 150 * time.Millisecond

// ConflictQueueSnapshot is the complete, self-contained queue state. Every
// emitted event carries one of these; the frontend never reconciles deltas.
type ConflictQueueSnapshot struct {
	RepoPath   string               `json:"repoPath"`
	Generation uint64               `json:"generation"`
	Entries    []ConflictQueueEntry `json:"entries"`
	ScannedAt  int64                `json:"scannedAt"`
	Error      string               `json:"error,omitempty"`
}

// ConflictQueueService owns the conflicted file queue for one repository.
// It never resolves conflicts; it only reports which files still need a
// decision and what can be done with each of them.
type ConflictQueueService struct {
	app *application.App
	git conflictQueueGit

	mu         sync.Mutex
	repoPath   string
	entries    []ConflictQueueEntry
	generation uint64
	scannedAt  int64
	lastError  string
	queued     int
	timer      *time.Timer

	scanMu sync.Mutex

	unsubscribe func()

	// Injection points for tests.
	debounce  time.Duration
	afterFunc func(time.Duration, func()) *time.Timer
	now       func() time.Time
}

func NewConflictQueueService() *ConflictQueueService {
	return &ConflictQueueService{
		git:       NewCommandRunner(),
		entries:   []ConflictQueueEntry{},
		debounce:  conflictQueueDebounce,
		afterFunc: time.AfterFunc,
		now:       time.Now,
	}
}

// SetApp sets the Wails application reference for event emission.
func (s *ConflictQueueService) SetApp(app *application.App) {
	s.app = app
}

// AttachToBus subscribes the queue to repository mutation events so any
// operation that can create or clear conflicts refreshes the queue.
func (s *ConflictQueueService) AttachToBus(bus *RepoEventBus) {
	s.DetachFromBus()
	s.unsubscribe = bus.Subscribe(func(event RepoMutated) {
		if s.tracksRepository(event.RepoPath) {
			s.scheduleScan()
		}
	})
}

// DetachFromBus removes the bus subscription, if any.
func (s *ConflictQueueService) DetachFromBus() {
	if s.unsubscribe != nil {
		s.unsubscribe()
		s.unsubscribe = nil
	}
}

// SetRepository binds the queue to a repository, clearing any prior state, and
// scans once so the caller receives an immediately usable snapshot.
func (s *ConflictQueueService) SetRepository(repoPath string) ConflictQueueSnapshot {
	done := LogMethod("ConflictQueueService.SetRepository", map[string]interface{}{"repoPath": repoPath})

	s.mu.Lock()
	s.stopTimerLocked()
	s.repoPath = strings.TrimSpace(repoPath)
	s.entries = []ConflictQueueEntry{}
	s.scannedAt = 0
	s.lastError = ""
	empty := s.repoPath == ""
	s.mu.Unlock()

	if empty {
		snapshot := s.emitSnapshot()
		done(snapshot, nil)
		return snapshot
	}

	snapshot := s.scan()
	done(snapshot, nil)
	return snapshot
}

// ClearRepository unbinds the queue and emits an empty snapshot.
func (s *ConflictQueueService) ClearRepository() ConflictQueueSnapshot {
	s.mu.Lock()
	s.stopTimerLocked()
	s.repoPath = ""
	s.entries = []ConflictQueueEntry{}
	s.scannedAt = 0
	s.lastError = ""
	s.mu.Unlock()

	return s.emitSnapshot()
}

// GetConflictQueue returns the current snapshot without rescanning.
func (s *ConflictQueueService) GetConflictQueue() ConflictQueueSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.snapshotLocked()
}

// Refresh forces an immediate rescan, coalesced with any scan already running.
func (s *ConflictQueueService) Refresh() ConflictQueueSnapshot {
	return s.scan()
}

// scheduleScan debounces rescans triggered by repository mutations.
func (s *ConflictQueueService) scheduleScan() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.repoPath == "" {
		return
	}
	s.stopTimerLocked()
	s.timer = s.afterFunc(s.debounce, func() { s.scan() })
}

func (s *ConflictQueueService) stopTimerLocked() {
	if s.timer != nil {
		s.timer.Stop()
		s.timer = nil
	}
}

// scan runs one classification pass. Scans are serialized, and a scan that is
// already superseded by another waiting scan is dropped instead of duplicating
// the work.
func (s *ConflictQueueService) scan() ConflictQueueSnapshot {
	s.mu.Lock()
	s.queued++
	s.mu.Unlock()

	s.scanMu.Lock()
	defer s.scanMu.Unlock()

	s.mu.Lock()
	s.queued--
	superseded := s.queued > 0
	repoPath := s.repoPath
	s.mu.Unlock()

	if superseded || repoPath == "" {
		return s.GetConflictQueue()
	}

	entries, err := classifyConflictQueue(s.git, repoPath)

	s.mu.Lock()
	if s.repoPath != repoPath {
		// The repository changed while this scan was running; discard it.
		s.mu.Unlock()
		return s.GetConflictQueue()
	}
	if err != nil {
		// Keep the last good entries so the UI shows a warning, not an
		// empty queue, when git is momentarily unreadable.
		s.lastError = err.Error()
	} else {
		s.entries = entries
		s.scannedAt = s.now().UnixMilli()
		s.lastError = ""
	}
	s.mu.Unlock()

	return s.emitSnapshot()
}

// emitSnapshot advances the generation, emits the snapshot, and returns it.
func (s *ConflictQueueService) emitSnapshot() ConflictQueueSnapshot {
	s.mu.Lock()
	s.generation++
	snapshot := s.snapshotLocked()
	s.mu.Unlock()

	if s.app != nil {
		s.app.Event.Emit(ConflictQueueChangedEvent, snapshot)
	}
	return snapshot
}

// snapshotLocked copies state out so callers can never mutate service state.
func (s *ConflictQueueService) snapshotLocked() ConflictQueueSnapshot {
	entries := make([]ConflictQueueEntry, len(s.entries))
	copy(entries, s.entries)

	return ConflictQueueSnapshot{
		RepoPath:   s.repoPath,
		Generation: s.generation,
		Entries:    entries,
		ScannedAt:  s.scannedAt,
		Error:      s.lastError,
	}
}

func (s *ConflictQueueService) tracksRepository(repoPath string) bool {
	s.mu.Lock()
	current := s.repoPath
	s.mu.Unlock()

	return current != "" && sameRepositoryPath(current, repoPath)
}

// sameRepositoryPath compares repository paths, tolerating separator and case
// differences on platforms with case-insensitive filesystems.
func sameRepositoryPath(left string, right string) bool {
	if left == "" || right == "" {
		return false
	}
	cleanLeft := filepath.Clean(left)
	cleanRight := filepath.Clean(right)
	if cleanLeft == cleanRight {
		return true
	}
	if runtime.GOOS == "windows" || runtime.GOOS == "darwin" {
		return strings.EqualFold(cleanLeft, cleanRight)
	}
	return false
}
