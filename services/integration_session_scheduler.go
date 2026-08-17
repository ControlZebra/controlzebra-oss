package services

import (
	"strings"
	"time"
)

// Background readiness scheduling. Saving is the trigger: by the time the user
// reaches Finish, the answer is already waiting rather than being computed
// while they stare at a modal.

// integrationReadinessDebounce is the quiet period after a save. Several saves
// in quick succession describe one piece of work, so they earn one check.
const integrationReadinessDebounce = time.Second

// integrationSettings is the slice of SettingsService the scheduler needs. The
// flag is read fresh on every trigger, so turning Developer Mode off stops the
// next check without any invalidation wiring.
type integrationSettings interface {
	GetAppSettings() AppSettings
}

// SetSettings supplies the Developer Mode gate. Without it the scheduler stays
// silent, which is the correct default for a feature that is still flagged.
func (s *IntegrationSessionService) SetSettings(settings *SettingsService) {
	s.settings = settings
}

// AttachToBus schedules a readiness check after each save. Only saves qualify:
// every other mutation either cannot change what the destination would receive,
// or is Finish itself moving the destination.
func (s *IntegrationSessionService) AttachToBus(bus *RepoEventBus) {
	s.DetachFromBus()
	s.unsubscribe = bus.Subscribe(func(event RepoMutated) {
		if event.Reason != RepoMutationCommit {
			return
		}
		s.scheduleReadiness(event.RepoPath)
	})
}

// DetachFromBus removes the bus subscription, if any.
func (s *IntegrationSessionService) DetachFromBus() {
	if s.unsubscribe != nil {
		s.unsubscribe()
		s.unsubscribe = nil
	}
}

func (s *IntegrationSessionService) scheduleReadiness(repoPath string) {
	repoPath = strings.TrimSpace(repoPath)
	if repoPath == "" {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if timer, found := s.scheduled[repoPath]; found {
		timer.Stop()
	}
	s.scheduled[repoPath] = s.afterFunc(s.debounce, func() { s.runScheduledReadiness(repoPath) })
}

// runScheduledReadiness performs the check a save earned. A scheduled check
// always assumes a squash finish, matching the product default; choosing a
// regular finish instead prepares a fresh session on demand.
func (s *IntegrationSessionService) runScheduledReadiness(repoPath string) {
	s.mu.Lock()
	delete(s.scheduled, repoPath)
	s.mu.Unlock()

	if !s.developerModeEnabled() {
		return
	}
	s.PrepareReadiness(repoPath, true)
}

func (s *IntegrationSessionService) developerModeEnabled() bool {
	if s.settings == nil {
		return false
	}
	return s.settings.GetAppSettings().DeveloperModeEnabled
}
