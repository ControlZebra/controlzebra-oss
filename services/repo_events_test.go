package services

import (
	"sync"
	"testing"
)

func TestRepoEventBusDeliversToAllSubscribers(t *testing.T) {
	bus := NewRepoEventBus()

	var received []RepoMutated
	bus.Subscribe(func(event RepoMutated) { received = append(received, event) })
	bus.Subscribe(func(event RepoMutated) { received = append(received, event) })

	bus.Publish(RepoMutated{RepoPath: "/repo", Reason: RepoMutationMerge})

	if len(received) != 2 {
		t.Fatalf("expected 2 deliveries, got %d", len(received))
	}
	for _, event := range received {
		if event.RepoPath != "/repo" || event.Reason != RepoMutationMerge {
			t.Fatalf("unexpected event payload: %+v", event)
		}
	}
}

func TestRepoEventBusUnsubscribeStopsDelivery(t *testing.T) {
	bus := NewRepoEventBus()

	calls := 0
	unsubscribe := bus.Subscribe(func(RepoMutated) { calls++ })

	bus.Publish(RepoMutated{RepoPath: "/repo"})
	unsubscribe()
	unsubscribe() // must be idempotent
	bus.Publish(RepoMutated{RepoPath: "/repo"})

	if calls != 1 {
		t.Fatalf("expected 1 call after unsubscribe, got %d", calls)
	}
	if bus.SubscriberCount() != 0 {
		t.Fatalf("expected no subscribers, got %d", bus.SubscriberCount())
	}
}

func TestRepoEventBusContainsPanickingSubscriber(t *testing.T) {
	bus := NewRepoEventBus()

	bus.Subscribe(func(RepoMutated) { panic("subscriber exploded") })
	healthy := 0
	bus.Subscribe(func(RepoMutated) { healthy++ })

	bus.Publish(RepoMutated{RepoPath: "/repo"})

	if healthy != 1 {
		t.Fatalf("expected healthy subscriber to run, got %d calls", healthy)
	}
}

func TestRepoEventBusNilSafe(t *testing.T) {
	var bus *RepoEventBus

	unsubscribe := bus.Subscribe(func(RepoMutated) {})
	unsubscribe()
	bus.Publish(RepoMutated{RepoPath: "/repo"})

	if bus.SubscriberCount() != 0 {
		t.Fatalf("expected 0 subscribers on nil bus")
	}
}

func TestRepoEventBusConcurrentPublishAndSubscribe(t *testing.T) {
	bus := NewRepoEventBus()

	var mu sync.Mutex
	delivered := 0
	bus.Subscribe(func(RepoMutated) {
		mu.Lock()
		delivered++
		mu.Unlock()
	})

	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			bus.Publish(RepoMutated{RepoPath: "/repo"})
		}()
		go func() {
			defer wg.Done()
			unsubscribe := bus.Subscribe(func(RepoMutated) {})
			unsubscribe()
		}()
	}
	wg.Wait()

	mu.Lock()
	defer mu.Unlock()
	if delivered != 50 {
		t.Fatalf("expected 50 deliveries to the stable subscriber, got %d", delivered)
	}
}
