package services

import (
	"fmt"
	"strings"
	"time"
)

// Conflict decisions for an isolated review are made against the session's own
// workspace, never against the user's open project. The frontend only ever
// holds a session id and repository-relative paths, so the workspace location
// stays a backend detail.

// IntegrationSessionConflictsEvent carries a full queue snapshot for one
// session. It is deliberately separate from ConflictQueueChangedEvent so the
// repository-bound queue and the session queue never overwrite each other.
const IntegrationSessionConflictsEvent = "integrationSession:conflicts"

// Sides the whole-file fallback can keep, matching the frontend's resolution
// strategy names.
const (
	integrationSideMine   = "mine"
	integrationSideTheirs = "theirs"
)

// SessionConflictSnapshot is the complete, self-contained queue state for one
// session. Generation lets the frontend drop a snapshot belonging to a review
// that has since been replaced.
type SessionConflictSnapshot struct {
	SessionID  string               `json:"sessionId"`
	Generation uint64               `json:"generation"`
	Entries    []ConflictQueueEntry `json:"entries"`
	ScannedAt  int64                `json:"scannedAt"`
	Error      string               `json:"error,omitempty"`
}

// GetSessionConflicts returns the files this review is currently asking about.
func (s *IntegrationSessionService) GetSessionConflicts(sessionID string) SessionConflictSnapshot {
	session, err := s.store.load(sessionID)
	if err != nil {
		return SessionConflictSnapshot{}
	}
	if session.State != integrationStateNeedsDecisions {
		return s.conflictSnapshot(session, []ConflictQueueEntry{}, nil)
	}
	return s.scanSessionConflicts(session)
}

// GetSessionConflictResolutionData loads one conflicted file for the resolver.
func (s *IntegrationSessionService) GetSessionConflictResolutionData(sessionID string, filePath string) ConflictResolutionData {
	session, path, err := s.queuedSessionFile(sessionID, filePath)
	if err != nil {
		return ConflictResolutionData{Path: normalizeMergePath(filePath), Error: err.Error()}
	}
	data := s.target.conflictResolutionData(integrationResolutionRepo(session), path, true)
	if sessionUsesLegacyWorkspace(session) {
		return integrationConflictResolutionData(data)
	}
	return data
}

// ResolveSessionConflictWithDecisions applies per-region choices to one file.
func (s *IntegrationSessionService) ResolveSessionConflictWithDecisions(sessionID string, filePath string, resolutionToken string, decisions []ConflictDecision) OperationResult {
	return s.resolveInSession(sessionID, filePath, func(session integrationSession, path string) OperationResult {
		if sessionUsesLegacyWorkspace(session) {
			decisions = integrationConflictDecisions(decisions)
		}
		return s.target.resolveConflictWithDecisions(
			integrationResolutionRepo(session),
			path,
			resolutionToken,
			decisions,
			true,
		)
	})
}

// ResolveSessionConflictWithContent applies a fully composed file.
func (s *IntegrationSessionService) ResolveSessionConflictWithContent(sessionID string, filePath string, resolutionToken string, content string) OperationResult {
	return s.resolveInSession(sessionID, filePath, func(session integrationSession, path string) OperationResult {
		return s.target.resolveConflictWithContent(integrationResolutionRepo(session), path, resolutionToken, content, true)
	})
}

// ResolveSessionConflictWithSide keeps one whole version of the file.
func (s *IntegrationSessionService) ResolveSessionConflictWithSide(sessionID string, filePath string, side string) OperationResult {
	return s.resolveInSession(sessionID, filePath, func(session integrationSession, path string) OperationResult {
		stage := conflictStageOurs
		sideName := "current"
		switch strings.TrimSpace(side) {
		case integrationSideMine:
		case integrationSideTheirs:
			stage = conflictStageTheirs
			sideName = "incoming"
		default:
			return failedOp("Choose which version of the file to keep, then try again.")
		}
		if sessionUsesLegacyWorkspace(session) {
			if stage == conflictStageOurs {
				stage = conflictStageTheirs
			} else {
				stage = conflictStageOurs
			}
		}
		return s.target.resolveConflictWithStage(integrationResolutionRepo(session), path, stage, sideName, true)
	})
}

// resolveInSession is the shared shape of every session resolution: check the
// file really is waiting for a decision, delegate to the existing resolver, and
// republish the queue so a fully resolved review becomes ready to finish.
func (s *IntegrationSessionService) resolveInSession(
	sessionID string,
	filePath string,
	resolve func(session integrationSession, path string) OperationResult,
) OperationResult {
	session, path, err := s.queuedSessionFile(sessionID, filePath)
	if err != nil {
		return failedOp(err.Error())
	}

	result := resolve(session, path)
	if !result.Success {
		return result
	}

	s.refreshSessionConflicts(session)
	return result
}

// queuedSessionFile confirms the review is still asking about this exact file
// before anything is read or written. A session id therefore cannot be used to
// reach a file the user was never shown.
func (s *IntegrationSessionService) queuedSessionFile(sessionID string, filePath string) (integrationSession, string, error) {
	session, err := s.store.load(sessionID)
	if err != nil {
		return integrationSession{}, "", fmt.Errorf("This review is no longer available. Save your work again to start a new check.")
	}
	if session.State != integrationStateNeedsDecisions {
		return integrationSession{}, "", fmt.Errorf("This review has no files waiting for a decision. Refresh and try again.")
	}
	repo := integrationResolutionRepo(session)
	if !sessionIsUpdate(session) {
		if err := verifyIntegrationOwnership(s.git, session.WorkspacePath, session.SessionID); err != nil {
			return integrationSession{}, "", fmt.Errorf("This review's working files are missing. Save your work again to start a new check.")
		}
	}

	path := normalizeMergePath(filePath)
	entries, err := classifyConflictQueue(s.git, repo)
	if err != nil {
		return integrationSession{}, "", fmt.Errorf("Couldn't read the files waiting for a decision. Try again in a moment.")
	}
	for _, entry := range entries {
		if entry.Path == path {
			return session, path, nil
		}
	}
	return integrationSession{}, "", fmt.Errorf("That file isn't waiting for a decision. Refresh the list and try again.")
}

// refreshSessionConflicts rescans after a decision, promotes a fully resolved
// review to ready, and publishes both the queue and the session state.
//
// A session replaced while the caller was working is dropped rather than
// published: its answer belongs to a review nobody is looking at any more.
func (s *IntegrationSessionService) refreshSessionConflicts(session integrationSession) SessionConflictSnapshot {
	current, err := s.store.load(session.SessionID)
	if err != nil || current.Generation != session.Generation || current.State != integrationStateNeedsDecisions {
		return SessionConflictSnapshot{}
	}

	snapshot := s.scanSessionConflicts(current)
	if snapshot.Error != "" || len(snapshot.Entries) > 0 {
		s.emitConflicts(snapshot)
		return snapshot
	}

	if sessionIsUpdate(current) {
		if commitErr := s.completeUpdate(&current); commitErr != nil {
			current.State = integrationStateFailed
			current.Error = commitErr.Error()
		}
	} else if resultErr := s.createResult(&current); resultErr != nil {
		current.State = integrationStateFailed
		current.Error = resultErr.Error()
	}
	current.UpdatedAt = time.Now().Unix()
	if saveErr := s.store.save(current); saveErr != nil {
		return snapshot
	}

	s.emitConflicts(snapshot)
	s.emit(current)
	return snapshot
}

func (s *IntegrationSessionService) scanSessionConflicts(session integrationSession) SessionConflictSnapshot {
	entries, err := classifyConflictQueue(s.git, integrationResolutionRepo(session))
	if sessionUsesLegacyWorkspace(session) {
		for index := range entries {
			entries[index] = integrationConflictQueueEntry(entries[index])
		}
	}
	return s.conflictSnapshot(session, entries, err)
}

// sessionIsUpdate reports whether a session is a pivot update that merges into
// the open project, as opposed to a legacy prepared-result session that works
// in an isolated workspace.
func sessionIsUpdate(session integrationSession) bool {
	return session.UpdateKind != "" || session.RemoteName != ""
}

func sessionIsDefaultSync(session integrationSession) bool {
	return session.UpdateKind == integrationUpdateKindDefaultSync
}

// integrationResolutionRepo is where this session's real conflict index lives:
// the open project for an update, the isolated workspace for a legacy session.
func integrationResolutionRepo(session integrationSession) string {
	if sessionIsUpdate(session) {
		return session.OpenProjectPath
	}
	return session.WorkspacePath
}

func sessionUsesLegacyWorkspace(session integrationSession) bool {
	return session.RemoteName == "" && session.WorkspacePath != ""
}

func integrationConflictQueueEntry(entry ConflictQueueEntry) ConflictQueueEntry {
	switch entry.Kind {
	case ConflictKindAddedByUs:
		entry.Kind = ConflictKindAddedByThem
	case ConflictKindAddedByThem:
		entry.Kind = ConflictKindAddedByUs
	case ConflictKindDeletedByUs:
		entry.Kind = ConflictKindDeletedByThem
	case ConflictKindDeletedByThem:
		entry.Kind = ConflictKindDeletedByUs
	}
	entry.HasOurs, entry.HasTheirs = entry.HasTheirs, entry.HasOurs
	return entry
}

func integrationConflictResolutionData(data ConflictResolutionData) ConflictResolutionData {
	data.Current, data.Incoming = data.Incoming, data.Current
	switch data.Status {
	case ConflictStatusDeletedByUs:
		data.Status = ConflictStatusDeletedByThem
	case ConflictStatusDeletedByThem:
		data.Status = ConflictStatusDeletedByUs
	}
	for index := range data.Regions {
		data.Regions[index].Current, data.Regions[index].Incoming =
			data.Regions[index].Incoming, data.Regions[index].Current
	}
	return data
}

func integrationConflictDecisions(decisions []ConflictDecision) []ConflictDecision {
	translated := make([]ConflictDecision, len(decisions))
	for index, decision := range decisions {
		decision.CurrentLines, decision.IncomingLines = decision.IncomingLines, decision.CurrentLines
		switch decision.Side {
		case "current":
			decision.Side = "incoming"
		case "incoming":
			decision.Side = "current"
		}
		translated[index] = decision
	}
	return translated
}

func (s *IntegrationSessionService) conflictSnapshot(session integrationSession, entries []ConflictQueueEntry, err error) SessionConflictSnapshot {
	snapshot := SessionConflictSnapshot{
		SessionID:  session.SessionID,
		Generation: session.Generation,
		Entries:    entries,
		ScannedAt:  time.Now().UnixMilli(),
	}
	if snapshot.Entries == nil {
		snapshot.Entries = []ConflictQueueEntry{}
	}
	if err != nil {
		snapshot.Entries = []ConflictQueueEntry{}
		snapshot.Error = err.Error()
	}
	return snapshot
}

func (s *IntegrationSessionService) emitConflicts(snapshot SessionConflictSnapshot) {
	if s.app != nil && snapshot.SessionID != "" {
		s.app.Event.Emit(IntegrationSessionConflictsEvent, snapshot)
	}
}
