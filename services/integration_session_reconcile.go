package services

import (
	"fmt"
	"strings"
	"time"
)

// After a crash or a restart, persisted sessions and the worktrees and refs
// they describe can disagree. Reconciliation reports that disagreement; it
// never resolves it by moving a ref. The user decides what happens to their
// work, always.

// integrationSessionTerminalStates are finished sessions whose records exist
// only until the next startup.
var integrationSessionTerminalStates = map[string]bool{
	integrationStateCompleted: true,
	integrationStateCancelled: true,
}

// integrationReconcileOutcome describes what happened to one persisted session.
type integrationReconcileOutcome struct {
	SessionID string `json:"sessionId"`
	State     string `json:"state"`
	Discarded bool   `json:"discarded"`
	Reason    string `json:"reason,omitempty"`
}

// reconcileIntegrationSessions pairs every persisted session with the workspace
// and result ref it claims. A session whose workspace is missing, unowned, or
// whose prepared result has vanished becomes a recoverable failure the user is
// told about, rather than something this function silently repairs.
func reconcileIntegrationSessions(runner gitAdminPathRunner, store *integrationSessionStore) ([]integrationReconcileOutcome, error) {
	sessions, err := store.list()
	if err != nil {
		return nil, err
	}

	outcomes := make([]integrationReconcileOutcome, 0, len(sessions))
	for _, session := range sessions {
		if integrationSessionTerminalStates[session.State] {
			if err := store.delete(session.SessionID); err != nil {
				return nil, err
			}
			outcomes = append(outcomes, integrationReconcileOutcome{
				SessionID: session.SessionID,
				State:     session.State,
				Discarded: true,
			})
			continue
		}

		reason := integrationSessionDamage(runner, session)
		if reason == "" {
			outcomes = append(outcomes, integrationReconcileOutcome{
				SessionID: session.SessionID,
				State:     session.State,
			})
			continue
		}

		session.State = integrationStateFailed
		session.Error = reason
		session.UpdatedAt = time.Now().Unix()
		if err := store.save(session); err != nil {
			return nil, err
		}
		outcomes = append(outcomes, integrationReconcileOutcome{
			SessionID: session.SessionID,
			State:     integrationStateFailed,
			Reason:    reason,
		})
	}
	return outcomes, nil
}

// integrationSessionDamage returns a plain-English reason the session can no
// longer be trusted, or an empty string when it is intact.
func integrationSessionDamage(runner gitAdminPathRunner, session integrationSession) string {
	if strings.TrimSpace(session.OpenProjectPath) == "" {
		return "This review lost track of its project."
	}
	if err := verifyIntegrationOwnership(runner, session.WorkspacePath, session.SessionID); err != nil {
		return "The files this review was using are gone."
	}
	if session.ResultOID != "" && !revisionExists(runner, session.OpenProjectPath, session.ResultOID) {
		return "The prepared result for this review is no longer available."
	}
	if !revisionExists(runner, session.OpenProjectPath, session.DestinationOID) ||
		!revisionExists(runner, session.OpenProjectPath, session.SourceOID) {
		return "The saved work this review was based on is no longer available."
	}
	return ""
}

func revisionExists(runner gitAdminPathRunner, repoPath string, oid string) bool {
	if strings.TrimSpace(oid) == "" {
		return false
	}
	return runner.RunGit(repoPath, "cat-file", "-e", oid+"^{commit}").Success
}

// integrationResultRef is the private namespace a prepared result lives in,
// deliberately outside refs/heads so it is unreachable from any branch.
func integrationResultRef(sessionID string) (string, error) {
	if !isValidIntegrationSessionID(sessionID) {
		return "", fmt.Errorf("invalid session id")
	}
	return "refs/controlzebra/integration/" + sessionID, nil
}
