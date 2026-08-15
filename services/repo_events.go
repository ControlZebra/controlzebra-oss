package services

import "sync"

// RepoMutationReason describes what changed a repository's state.
type RepoMutationReason string

const (
	RepoMutationMerge      RepoMutationReason = "merge"
	RepoMutationPull       RepoMutationReason = "pull"
	RepoMutationCherryPick RepoMutationReason = "cherry-pick"
	RepoMutationRevert     RepoMutationReason = "revert"
	RepoMutationRebase     RepoMutationReason = "rebase"
	RepoMutationStash      RepoMutationReason = "stash"
	RepoMutationAbort      RepoMutationReason = "abort"
	RepoMutationContinue   RepoMutationReason = "continue"
	RepoMutationCommit     RepoMutationReason = "commit"
	RepoMutationCheckout   RepoMutationReason = "checkout"
	RepoMutationOther      RepoMutationReason = "other"
)

// RepoMutated is published whenever an operation may have changed the
// unmerged state of a repository.
type RepoMutated struct {
	RepoPath string
	Reason   RepoMutationReason
}

// RepoEventBus is a minimal in-process publish/subscribe bus for repository
// mutation events. It exists so state-holding services can react to git
// operations without those operations depending on the services themselves.
type RepoEventBus struct {
	mu          sync.RWMutex
	nextID      uint64
	subscribers map[uint64]func(RepoMutated)
}

func NewRepoEventBus() *RepoEventBus {
	return &RepoEventBus{subscribers: make(map[uint64]func(RepoMutated))}
}

// Subscribe registers a handler and returns a function that removes it.
// Handlers must not block; long work belongs on the subscriber's own goroutine.
func (b *RepoEventBus) Subscribe(handler func(RepoMutated)) func() {
	if b == nil || handler == nil {
		return func() {}
	}

	b.mu.Lock()
	if b.subscribers == nil {
		b.subscribers = make(map[uint64]func(RepoMutated))
	}
	b.nextID++
	id := b.nextID
	b.subscribers[id] = handler
	b.mu.Unlock()

	var once sync.Once
	return func() {
		once.Do(func() {
			b.mu.Lock()
			delete(b.subscribers, id)
			b.mu.Unlock()
		})
	}
}

// Publish delivers an event to every current subscriber. A panicking
// subscriber is contained so it cannot break delivery to the others.
func (b *RepoEventBus) Publish(event RepoMutated) {
	if b == nil {
		return
	}

	b.mu.RLock()
	handlers := make([]func(RepoMutated), 0, len(b.subscribers))
	for _, handler := range b.subscribers {
		handlers = append(handlers, handler)
	}
	b.mu.RUnlock()

	for _, handler := range handlers {
		deliverRepoEvent(handler, event)
	}
}

// SubscriberCount reports how many handlers are currently registered.
func (b *RepoEventBus) SubscriberCount() int {
	if b == nil {
		return 0
	}
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subscribers)
}

func deliverRepoEvent(handler func(RepoMutated), event RepoMutated) {
	defer func() {
		_ = recover()
	}()
	handler(event)
}
