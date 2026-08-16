package services

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
)

// An isolated integration session must survive a crash and a restart, because
// the user's decisions live inside it. Everything here is persistence only: no
// git mutation, no ref movement.

const (
	// integrationSessionSchemaVersion guards forward compatibility. A session
	// written by a newer build is ignored rather than misread.
	integrationSessionSchemaVersion = 1

	integrationSessionsSubDir  = "sessions"
	integrationWorkspaceSubDir = "workspaces"

	integrationSessionDirMode  os.FileMode = 0o700
	integrationSessionFileMode os.FileMode = 0o600
)

// Session lifecycle states. These mirror the outcome strings drafted in
// services/integration_session_messages_test.go.
const (
	integrationStateScheduled      = "scheduled"
	integrationStatePreparing      = "preparing"
	integrationStateNeedsDecisions = "needs-decisions"
	integrationStateReady          = "ready"
	integrationStateApplying       = "applying"
	integrationStateBlocked        = "blocked"
	integrationStateCompleted      = "completed"
	integrationStateObsolete       = "obsolete"
	integrationStateFailed         = "failed"
	integrationStateCancelled      = "cancelled"
)

// Merge modes the session can prepare.
const (
	integrationModeRegular = "regular"
	integrationModeSquash  = "squash"
)

// integrationSession is the persisted record of one isolated review.
//
// Readiness is scoped to the immutable tuple of RepositoryCommonDir, SourceOID,
// DestinationRef, DestinationOID, and MergeMode. Any change to a captured OID
// invalidates the session rather than updating it.
type integrationSession struct {
	SchemaVersion int `json:"schemaVersion"`

	SessionID           string `json:"sessionId"`
	RepositoryCommonDir string `json:"repositoryCommonDir"`
	OpenProjectPath     string `json:"openProjectPath"`
	WorkspacePath       string `json:"workspacePath"`

	OperationKind string `json:"operationKind"`
	MergeMode     string `json:"mergeMode"`

	SourceRef      string `json:"sourceRef"`
	SourceOID      string `json:"sourceOid"`
	DestinationRef string `json:"destinationRef"`
	DestinationOID string `json:"destinationOid"`
	ResultOID      string `json:"resultOid,omitempty"`

	State      string `json:"state"`
	Generation uint64 `json:"generation"`
	Error      string `json:"error,omitempty"`

	CreatedAt int64 `json:"createdAt"`
	UpdatedAt int64 `json:"updatedAt"`
}

// newIntegrationSessionID returns an opaque, unguessable identifier. It is the
// only handle the frontend ever receives, so it must not be enumerable.
func newIntegrationSessionID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", fmt.Errorf("failed to generate a session id: %w", err)
	}
	return hex.EncodeToString(raw), nil
}

// isValidIntegrationSessionID rejects anything that could escape the store
// directory. Session ids are hex, so this is strict on purpose.
func isValidIntegrationSessionID(sessionID string) bool {
	if len(sessionID) != 32 {
		return false
	}
	_, err := hex.DecodeString(sessionID)
	return err == nil
}

// integrationSessionStore persists sessions as one file each, written
// atomically so a crash mid-write cannot leave a half-parsed session.
type integrationSessionStore struct {
	root string

	mu sync.Mutex
}

func newIntegrationSessionStore(integrationDir string) *integrationSessionStore {
	return &integrationSessionStore{root: filepath.Join(integrationDir, integrationSessionsSubDir)}
}

// defaultIntegrationSessionStore uses the resolved application data layout.
func defaultIntegrationSessionStore() *integrationSessionStore {
	return newIntegrationSessionStore(resolveDataLocations().IntegrationDir)
}

// integrationWorkspaceRoot is where session worktrees are materialized.
func integrationWorkspaceRoot(integrationDir string) string {
	return filepath.Join(integrationDir, integrationWorkspaceSubDir)
}

func (s *integrationSessionStore) sessionPath(sessionID string) (string, error) {
	if !isValidIntegrationSessionID(sessionID) {
		return "", fmt.Errorf("invalid session id")
	}
	return filepath.Join(s.root, sessionID+".json"), nil
}

// save writes the session atomically: a temporary file in the same directory,
// then a replace. Readers therefore see either the old record or the new one.
func (s *integrationSessionStore) save(session integrationSession) error {
	path, err := s.sessionPath(session.SessionID)
	if err != nil {
		return err
	}
	session.SchemaVersion = integrationSessionSchemaVersion

	payload, err := json.MarshalIndent(session, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode session: %w", err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.root, integrationSessionDirMode); err != nil {
		return fmt.Errorf("failed to create the session directory: %w", err)
	}

	temp, err := os.CreateTemp(s.root, session.SessionID+".*.tmp")
	if err != nil {
		return fmt.Errorf("failed to stage the session file: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)

	if err := temp.Chmod(integrationSessionFileMode); err != nil {
		temp.Close()
		return fmt.Errorf("failed to secure the session file: %w", err)
	}
	if _, err := temp.Write(payload); err != nil {
		temp.Close()
		return fmt.Errorf("failed to write the session file: %w", err)
	}
	if err := temp.Sync(); err != nil {
		temp.Close()
		return fmt.Errorf("failed to flush the session file: %w", err)
	}
	if err := temp.Close(); err != nil {
		return fmt.Errorf("failed to close the session file: %w", err)
	}

	if err := replaceFileAtomic(tempPath, path); err != nil {
		return fmt.Errorf("failed to store the session file: %w", err)
	}
	return nil
}

func (s *integrationSessionStore) load(sessionID string) (integrationSession, error) {
	path, err := s.sessionPath(sessionID)
	if err != nil {
		return integrationSession{}, err
	}

	payload, err := os.ReadFile(path)
	if err != nil {
		return integrationSession{}, err
	}
	return decodeIntegrationSession(payload)
}

// list returns every readable session, sorted by creation time. Unreadable or
// future-schema files are skipped rather than failing the whole listing, so one
// corrupt file cannot hide every other active review.
func (s *integrationSessionStore) list() ([]integrationSession, error) {
	entries, err := os.ReadDir(s.root)
	if err != nil {
		if os.IsNotExist(err) {
			return []integrationSession{}, nil
		}
		return nil, fmt.Errorf("failed to read the session directory: %w", err)
	}

	sessions := []integrationSession{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		payload, err := os.ReadFile(filepath.Join(s.root, entry.Name()))
		if err != nil {
			continue
		}
		session, err := decodeIntegrationSession(payload)
		if err != nil {
			continue
		}
		sessions = append(sessions, session)
	}

	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].CreatedAt == sessions[j].CreatedAt {
			return sessions[i].SessionID < sessions[j].SessionID
		}
		return sessions[i].CreatedAt < sessions[j].CreatedAt
	})
	return sessions, nil
}

// delete removes a session record. Deleting a session that is already gone
// succeeds, so cancellation can be retried safely.
func (s *integrationSessionStore) delete(sessionID string) error {
	path, err := s.sessionPath(sessionID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to remove the session file: %w", err)
	}
	return nil
}

func decodeIntegrationSession(payload []byte) (integrationSession, error) {
	session := integrationSession{}
	if err := json.Unmarshal(payload, &session); err != nil {
		return integrationSession{}, fmt.Errorf("failed to decode session: %w", err)
	}
	if session.SchemaVersion > integrationSessionSchemaVersion {
		return integrationSession{}, fmt.Errorf("session was written by a newer version")
	}
	if !isValidIntegrationSessionID(session.SessionID) {
		return integrationSession{}, fmt.Errorf("session has an invalid id")
	}
	return session, nil
}
