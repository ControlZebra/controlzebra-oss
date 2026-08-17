package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// IntegrationSessionService prepares and applies isolated integration results.
//
// Everything it does happens in a backend-owned worktree, so the user's open
// project is never left in an unmerged state. Preparation answers one question
// -- can this exact saved revision be combined with this exact destination
// revision -- and Finish applies an already prepared answer rather than
// redoing the work.

// IntegrationSessionChangedEvent carries a full session snapshot to the
// frontend. Every emission is self-contained; the frontend never merges deltas.
const IntegrationSessionChangedEvent = "integrationSession:changed"

// integrationSessionOutcomeMessages is the user-facing wording for every state
// the workflow can report. Two parts each: what happened, then a next step.
// Locked down in Phase 0 and enforced by tests in
// integration_session_messages_test.go.
var integrationSessionOutcomeMessages = map[string]string{
	integrationStateScheduled: "Your saved work is queued for a compatibility check. Keep working, and we'll tell you when it finishes.",

	integrationStatePreparing: "We're checking your saved work against the shared project. Keep working, nothing in your project is being changed.",

	integrationStateNeedsDecisions: "Some files were changed in both your work and the shared project. Open Conflict Review to pick which version to keep for each file.",

	integrationStateReady: "Your work is ready to be combined with the shared project. Choose Finish when you want to send it.",

	integrationStateBlocked: "Your work is ready, but this project has unsaved files that would be replaced. Save or discard those files, then choose Finish again.",

	integrationStateObsolete: "Your saved work changed, so Conflict Review was refreshed. Review the latest files before finishing.",

	integrationStateFailed: "The compatibility check couldn't finish, and nothing in your project was changed. Try again, and contact support if it keeps failing.",

	integrationStateCancelled: "Conflict Review was cancelled and your decisions were deleted. Nothing in your project or the shared project changed.",

	integrationStateApplying: "We're combining your work with the shared project. This only takes a moment.",

	integrationStateCompleted: "Your work is now part of the shared project. You can keep working on this project as usual.",

	"recovered": "ControlZebra found an unfinished check after restarting. Review the files again before choosing Finish.",
}

// integrationGit is the slice of GitService the session service needs: the
// rules that pick the destination branch, and the conflict resolution core.
// Keeping it narrow lets tests drive the service without the rest of GitService.
type integrationGit interface {
	mergeTargetRef(repoPath string) (branch string, ref string, ok bool)
	conflictResolutionData(repoPath string, filePath string, inOperation bool) ConflictResolutionData
	resolveConflictWithContent(repoPath string, filePath string, resolutionToken string, content string, inOperation bool) OperationResult
	resolveConflictWithDecisions(repoPath string, filePath string, resolutionToken string, decisions []ConflictDecision, inOperation bool) OperationResult
	resolveConflictWithStage(repoPath string, filePath string, stage int, sideName string, inOperation bool) OperationResult
}

// IntegrationSessionSnapshot is the complete state the frontend sees. It
// deliberately carries no filesystem path: temporary workspace locations never
// cross the Wails boundary.
type IntegrationSessionSnapshot struct {
	SessionID      string `json:"sessionId"`
	State          string `json:"state"`
	Message        string `json:"message"`
	MergeMode      string `json:"mergeMode"`
	SourceBranch   string `json:"sourceBranch"`
	SourceOID      string `json:"sourceOid"`
	TargetBranch   string `json:"targetBranch"`
	DestinationOID string `json:"destinationOid"`
	Generation     uint64 `json:"generation"`
	HasResult      bool   `json:"hasResult"`
	Active         bool   `json:"active"`
	Error          string `json:"error,omitempty"`
	UpdatedAt      int64  `json:"updatedAt"`
}

// integrationGitTimeout bounds every git call this service makes. Preparation
// materializes a whole tree and merges it, and Finish writes that tree into the
// user's project, so the 30-second default is wrong for a large LFS project.
const integrationGitTimeout = 5 * time.Minute

type IntegrationSessionService struct {
	app      *application.App
	git      *CommandRunner
	target   integrationGit
	settings integrationSettings
	store    *integrationSessionStore
	bus      *RepoEventBus

	workspaceRoot string

	// preparing enforces one in-flight preparation per common repository, and
	// scheduled holds the debounce timer per repository path.
	mu        sync.Mutex
	preparing map[string]bool
	scheduled map[string]*time.Timer

	unsubscribe func()

	// Injection points for tests.
	debounce  time.Duration
	afterFunc func(time.Duration, func()) *time.Timer
}

func NewIntegrationSessionService(target integrationGit) *IntegrationSessionService {
	locations := resolveDataLocations()
	runner := NewCommandRunner()
	runner.Timeout = integrationGitTimeout

	return &IntegrationSessionService{
		git:           runner,
		target:        target,
		store:         newIntegrationSessionStore(locations.IntegrationDir),
		workspaceRoot: integrationWorkspaceRoot(locations.IntegrationDir),
		preparing:     map[string]bool{},
		scheduled:     map[string]*time.Timer{},
		debounce:      integrationReadinessDebounce,
		afterFunc:     time.AfterFunc,
	}
}

// SetApp sets the Wails application reference for event emission.
func (s *IntegrationSessionService) SetApp(app *application.App) {
	s.app = app
}

// SetRepoEventBus lets a successful Finish announce that the repository moved,
// so the conflict queue and the file watcher refresh.
func (s *IntegrationSessionService) SetRepoEventBus(bus *RepoEventBus) {
	s.bus = bus
}

// PrepareReadiness runs an authoritative integration check for the work
// currently checked out in repoPath.
//
// It returns an empty snapshot, silently, when there is no destination worth
// checking against: a detached HEAD, an integration branch nobody merges from,
// or a destination that exists only on the remote. Nothing has gone wrong in
// those cases, so there is nothing to report.
func (s *IntegrationSessionService) PrepareReadiness(repoPath string, squashMerge bool) IntegrationSessionSnapshot {
	done := LogMethod("IntegrationSessionService.PrepareReadiness", map[string]interface{}{"repoPath": repoPath, "squashMerge": squashMerge})

	repoPath = strings.TrimSpace(repoPath)
	if repoPath == "" {
		done(IntegrationSessionSnapshot{}, nil)
		return IntegrationSessionSnapshot{}
	}

	target, ok := s.resolveTarget(repoPath)
	if !ok {
		done(IntegrationSessionSnapshot{}, nil)
		return IntegrationSessionSnapshot{}
	}

	mode := integrationModeRegular
	if squashMerge {
		mode = integrationModeSquash
	}

	identity := repositoryLockKey(s.git, repoPath)
	if !s.claimPreparation(identity) {
		snapshot := IntegrationSessionSnapshot{State: integrationStatePreparing, Message: integrationSessionOutcomeMessages[integrationStatePreparing]}
		done(snapshot, nil)
		return snapshot
	}
	defer s.releasePreparation(identity)

	if existing, found := s.currentSession(identity); found {
		if s.sessionMatchesTarget(existing, target, mode) && integrationSessionIsUsable(existing) {
			snapshot := s.snapshot(existing)
			done(snapshot, nil)
			return snapshot
		}
		s.replaceSession(existing)
	}

	session, err := s.newSession(repoPath, identity, target, mode)
	if err != nil {
		snapshot := s.failedSnapshot(err)
		done(snapshot, err)
		return snapshot
	}

	entries, err := s.prepare(&session)
	if err != nil {
		session.State = integrationStateFailed
		session.Error = err.Error()
	}
	session.UpdatedAt = time.Now().Unix()
	if saveErr := s.store.save(session); saveErr != nil {
		snapshot := s.failedSnapshot(saveErr)
		done(snapshot, saveErr)
		return snapshot
	}

	snapshot := s.emit(session)
	if session.State == integrationStateNeedsDecisions {
		s.emitConflicts(s.conflictSnapshot(session, entries, nil))
	}
	done(snapshot, nil)
	return snapshot
}

// GetSessionState returns the current state of one session. An unknown session
// id yields an empty snapshot rather than an error, because a session can
// legitimately disappear between the frontend reading it and asking about it.
func (s *IntegrationSessionService) GetSessionState(sessionID string) IntegrationSessionSnapshot {
	session, err := s.store.load(sessionID)
	if err != nil {
		return IntegrationSessionSnapshot{}
	}
	return s.snapshot(session)
}

// ListSessions returns every session belonging to the repository containing
// repoPath, including its linked worktrees.
func (s *IntegrationSessionService) ListSessions(repoPath string) []IntegrationSessionSnapshot {
	snapshots := []IntegrationSessionSnapshot{}
	repoPath = strings.TrimSpace(repoPath)
	if repoPath == "" {
		return snapshots
	}

	identity := repositoryLockKey(s.git, repoPath)
	sessions, err := s.store.list()
	if err != nil {
		return snapshots
	}
	for _, session := range sessions {
		if session.RepositoryCommonDir == identity {
			snapshots = append(snapshots, s.snapshot(session))
		}
	}
	return snapshots
}

// FinishSession applies an already prepared result. It never rebuilds the
// merge: if a valid result exists, that result is what gets applied.
func (s *IntegrationSessionService) FinishSession(sessionID string) OperationResult {
	done := LogMethod("IntegrationSessionService.FinishSession", map[string]interface{}{"sessionId": sessionID})

	session, err := s.store.load(sessionID)
	if err != nil {
		result := failedOp("This review is no longer available. Save your work again to start a new check.")
		done(result, err)
		return result
	}

	result := s.finish(&session)
	done(result, nil)
	return result
}

// CancelSession discards a review. It moves neither branch, and cancelling a
// session that is already gone succeeds.
func (s *IntegrationSessionService) CancelSession(sessionID string) OperationResult {
	done := LogMethod("IntegrationSessionService.CancelSession", map[string]interface{}{"sessionId": sessionID})

	session, err := s.store.load(sessionID)
	if err != nil {
		if os.IsNotExist(err) {
			result := successOp(integrationSessionOutcomeMessages[integrationStateCancelled])
			done(result, nil)
			return result
		}
		result := failedOp("Couldn't cancel this review. Try again in a moment.")
		done(result, err)
		return result
	}

	release := sharedRepositoryCoordinator.lockRepo(session.OpenProjectPath)
	defer release()

	if err := cancelIntegrationSession(s.git, s.store, session); err != nil {
		result := failedOp("Couldn't fully clean up this review. Close and reopen the project, then try again.")
		done(result, err)
		return result
	}

	result := successOp(integrationSessionOutcomeMessages[integrationStateCancelled])
	done(result, nil)
	return result
}

// RecoverSessions reconciles persisted sessions with the worktrees and refs
// they claim. Called once at startup. It never moves a ref.
func (s *IntegrationSessionService) RecoverSessions() OperationResult {
	done := LogMethod("IntegrationSessionService.RecoverSessions", nil)

	outcomes, err := reconcileIntegrationSessions(s.git, s.store)
	if err != nil {
		result := failedOp("Couldn't check for unfinished reviews. Everything in your projects is unchanged.")
		done(result, err)
		return result
	}

	recovered := 0
	for _, outcome := range outcomes {
		if !outcome.Discarded {
			recovered++
		}
	}
	if recovered == 0 {
		result := successOp("No unfinished reviews were found.")
		done(result, nil)
		return result
	}

	result := successOp(integrationSessionOutcomeMessages["recovered"])
	done(result, nil)
	return result
}

// --- preparation -----------------------------------------------------------

// integrationTarget is the immutable tuple readiness is scoped to.
type integrationTarget struct {
	sourceBranch   string
	sourceRef      string
	sourceOID      string
	targetBranch   string
	destinationRef string
	destinationOID string
}

// resolveTarget captures local revisions only. Phase 2 does not fetch, so a
// readiness result describes the destination as this computer currently knows
// it. A destination that moved is detected at Finish and refreshes the review.
func (s *IntegrationSessionService) resolveTarget(repoPath string) (integrationTarget, bool) {
	targetBranch, _, ok := s.target.mergeTargetRef(repoPath)
	if !ok {
		return integrationTarget{}, false
	}

	sourceRefResult := s.git.RunGit(repoPath, "symbolic-ref", "--quiet", "HEAD")
	sourceRef := strings.TrimSpace(sourceRefResult.Stdout)
	if !sourceRefResult.Success || sourceRef == "" {
		return integrationTarget{}, false
	}

	// The local branch is the only thing Finish can update, so a destination
	// that exists only on the remote is not a destination yet.
	destinationRef := "refs/heads/" + targetBranch
	destinationOID, ok := s.revision(repoPath, destinationRef)
	if !ok {
		return integrationTarget{}, false
	}
	sourceOID, ok := s.revision(repoPath, sourceRef)
	if !ok {
		return integrationTarget{}, false
	}

	return integrationTarget{
		sourceBranch:   strings.TrimPrefix(sourceRef, "refs/heads/"),
		sourceRef:      sourceRef,
		sourceOID:      sourceOID,
		targetBranch:   targetBranch,
		destinationRef: destinationRef,
		destinationOID: destinationOID,
	}, true
}

func (s *IntegrationSessionService) revision(repoPath string, rev string) (string, bool) {
	result := s.git.RunGit(repoPath, "rev-parse", "--verify", "--quiet", rev+"^{commit}")
	oid := strings.TrimSpace(result.Stdout)
	return oid, result.Success && oid != ""
}

func (s *IntegrationSessionService) newSession(repoPath string, identity string, target integrationTarget, mode string) (integrationSession, error) {
	sessionID, err := newIntegrationSessionID()
	if err != nil {
		return integrationSession{}, err
	}

	now := time.Now().Unix()
	return integrationSession{
		SessionID:           sessionID,
		RepositoryCommonDir: identity,
		OpenProjectPath:     repoPath,
		WorkspacePath:       filepath.Join(s.workspaceRoot, sessionID),
		OperationKind:       "merge",
		MergeMode:           mode,
		SourceRef:           target.sourceRef,
		SourceOID:           target.sourceOID,
		DestinationRef:      target.destinationRef,
		DestinationOID:      target.destinationOID,
		State:               integrationStatePreparing,
		Generation:          uint64(now),
		CreatedAt:           now,
		UpdatedAt:           now,
	}, nil
}

// prepare materializes the workspace, runs the real merge, and classifies the
// outcome. On any failure the workspace is unwound so nothing is left behind.
// The classified entries come back so the caller can publish them without
// rescanning.
func (s *IntegrationSessionService) prepare(session *integrationSession) ([]ConflictQueueEntry, error) {
	empty := []ConflictQueueEntry{}

	// Work already contained in the destination has nothing to integrate. The
	// destination revision is its own result, so Finish becomes a no-op rather
	// than an empty merge commit nobody asked for.
	if s.git.RunGit(session.OpenProjectPath, "merge-base", "--is-ancestor", session.SourceOID, session.DestinationOID).Success {
		session.State = integrationStateReady
		session.ResultOID = session.DestinationOID
		return empty, nil
	}

	if err := createIntegrationWorkspace(s.git, session.OpenProjectPath, session.SessionID, session.DestinationOID, session.WorkspacePath); err != nil {
		return empty, err
	}

	args := []string{"merge", "--no-commit", "--no-ff", session.SourceOID}
	if session.MergeMode == integrationModeSquash {
		args = []string{"merge", "--squash", session.SourceOID}
	}
	mergeResult := s.git.RunGit(session.WorkspacePath, args...)

	entries, err := classifyConflictQueue(s.git, session.WorkspacePath)
	if err != nil {
		forceRemoveIntegrationWorkspace(s.git, session.OpenProjectPath, session.WorkspacePath)
		return empty, fmt.Errorf("failed to inspect the checked files: %w", err)
	}
	if len(entries) > 0 {
		session.State = integrationStateNeedsDecisions
		return entries, nil
	}
	if !mergeResult.Success {
		// No unmerged files, so this was a real failure rather than a conflict.
		forceRemoveIntegrationWorkspace(s.git, session.OpenProjectPath, session.WorkspacePath)
		return empty, fmt.Errorf("failed to check this work against the shared project: %s", getErrorMessage(mergeResult))
	}

	return empty, s.createResult(session)
}

// createResult writes the prepared result into the private integration
// namespace. commit-tree is the primitive because it takes explicit parents and
// cannot run repository hooks, so a project's pre-commit hook never sees a
// commit the user did not make.
func (s *IntegrationSessionService) createResult(session *integrationSession) error {
	// A result may only be built from a fully resolved workspace, so every
	// caller pays for one authoritative check rather than trusting its own.
	entries, err := classifyConflictQueue(s.git, session.WorkspacePath)
	if err != nil {
		return fmt.Errorf("failed to inspect the checked files: %w", err)
	}
	if len(entries) > 0 {
		return fmt.Errorf("some files still need a decision")
	}

	treeResult := s.git.RunGit(session.WorkspacePath, "write-tree")
	treeOID := strings.TrimSpace(treeResult.Stdout)
	if !treeResult.Success || treeOID == "" {
		return fmt.Errorf("failed to prepare the combined files: %s", getErrorMessage(treeResult))
	}

	args := []string{"commit-tree", treeOID, "-p", session.DestinationOID}
	if session.MergeMode == integrationModeRegular {
		args = append(args, "-p", session.SourceOID)
	}
	args = append(args, "-m", integrationResultMessage(*session))

	commitResult := s.git.RunGit(session.WorkspacePath, args...)
	resultOID := strings.TrimSpace(commitResult.Stdout)
	if !commitResult.Success || resultOID == "" {
		return fmt.Errorf("failed to prepare the combined result: %s", getErrorMessage(commitResult))
	}

	ref, err := integrationResultRef(session.SessionID)
	if err != nil {
		return err
	}
	if updateResult := s.git.RunGit(session.OpenProjectPath, "update-ref", ref, resultOID); !updateResult.Success {
		return fmt.Errorf("failed to store the prepared result: %s", getErrorMessage(updateResult))
	}

	session.ResultOID = resultOID
	session.State = integrationStateReady
	return nil
}

func integrationResultMessage(session integrationSession) string {
	source := strings.TrimPrefix(session.SourceRef, "refs/heads/")
	destination := strings.TrimPrefix(session.DestinationRef, "refs/heads/")
	if session.MergeMode == integrationModeSquash {
		return fmt.Sprintf("Squashed changes from %s into %s", source, destination)
	}
	return fmt.Sprintf("Merge %s into %s", source, destination)
}

// --- finish ----------------------------------------------------------------

// finish is the ten-step protocol. Numbered comments map to the plan.
func (s *IntegrationSessionService) finish(session *integrationSession) OperationResult {
	// 1. The session must hold a prepared result.
	if session.State != integrationStateReady && session.State != integrationStateBlocked {
		return failedOp(s.messageFor(session.State))
	}
	if strings.TrimSpace(session.ResultOID) == "" {
		return failedOp("This work hasn't finished being checked yet. Wait for the check to finish, then choose Finish again.")
	}

	// 2. The captured revisions must still be current.
	if !s.revisionsStillMatch(*session) {
		s.replaceSession(*session)
		return failedOp(integrationSessionOutcomeMessages[integrationStateObsolete])
	}

	// 3. Record the attempt before mutating anything, so a crash here is
	// recoverable rather than invisible.
	if err := s.transition(session, integrationStateApplying, ""); err != nil {
		return failedOp("Couldn't start combining your work. Try again in a moment.")
	}

	// 4. Serialize against every other service that can move refs.
	release := sharedRepositoryCoordinator.lockRepo(session.OpenProjectPath)
	defer release()

	owner, err := destinationWorktreePath(s.git, session.OpenProjectPath, session.DestinationRef)
	if err != nil {
		s.transition(session, integrationStateReady, "")
		return failedOp("Couldn't check which project is using the shared work. Try again in a moment.")
	}

	// 5. Revalidate while the lock is held. Steps 2 and 5 are both required:
	// step 2 avoids taking the lock pointlessly, step 5 closes the race.
	if !s.revisionsStillMatch(*session) {
		s.replaceSession(*session)
		return failedOp(integrationSessionOutcomeMessages[integrationStateObsolete])
	}

	// 6, 7, 8. Apply through whichever primitive is safe for this destination.
	if err := s.applyResult(*session, owner); err != nil {
		s.transition(session, integrationStateBlocked, err.Error())
		s.emit(*session)
		return failedOp(err.Error())
	}

	// 9. Verify before declaring success.
	if err := s.verifyApplied(*session, owner); err != nil {
		s.transition(session, integrationStateFailed, err.Error())
		s.emit(*session)
		return failedOp(err.Error())
	}

	// 10. Publish, clean up, and report.
	s.transition(session, integrationStateCompleted, "")
	s.publishMutation(session.OpenProjectPath)
	if owner != "" {
		s.publishMutation(owner)
	}
	s.cleanUpAfterFinish(*session)
	s.emit(*session)

	return successOp(integrationSessionOutcomeMessages[integrationStateCompleted])
}

// applyResult picks the primitive that matches how the destination is being
// used, because no single Git command is correct for all three cases.
func (s *IntegrationSessionService) applyResult(session integrationSession, owner string) error {
	switch {
	case owner == "":
		// Nothing has the destination checked out, so there are no working
		// files to disturb. update-ref with an expected old value is a true
		// compare-and-swap: if anything moved the destination since step 5,
		// this fails instead of overwriting it.
		result := s.git.RunGit(session.OpenProjectPath, "update-ref", session.DestinationRef, session.ResultOID, session.DestinationOID)
		if !result.Success {
			return fmt.Errorf("the shared project changed while we were combining your work. Check your files again, then choose Finish")
		}
		return nil

	case sameWorkingCopy(owner, session.OpenProjectPath):
		// The result was built on the captured destination revision, so a
		// fast-forward updates the ref, files, and staged state together. Git
		// refuses on its own when local work would be replaced, which is
		// stricter and race-free compared with checking first and then merging.
		result := s.git.RunGit(session.OpenProjectPath, "merge", "--ff-only", session.ResultOID)
		if !result.Success {
			return fmt.Errorf("%s", integrationSessionOutcomeMessages[integrationStateBlocked])
		}
		return nil

	default:
		return fmt.Errorf("another open copy of this project is using the shared work. Close it, then choose Finish again")
	}
}

// verifyApplied confirms the destination really landed where it should, rather
// than trusting the exit code of the command that moved it.
func (s *IntegrationSessionService) verifyApplied(session integrationSession, owner string) error {
	applied, ok := s.revision(session.OpenProjectPath, session.DestinationRef)
	if !ok || applied != session.ResultOID {
		return fmt.Errorf("your work couldn't be combined with the shared project. Nothing was changed, so you can safely try again")
	}
	if owner != "" && !s.git.RunGit(owner, "diff", "--quiet", "HEAD").Success {
		return fmt.Errorf("your files don't match the combined result yet. Close and reopen the project, then check your files")
	}
	return nil
}

// cleanUpAfterFinish removes the workspace and the private result ref. The
// session record itself survives until the next startup, where reconciliation
// discards it, so a crash during cleanup still leaves a trail.
func (s *IntegrationSessionService) cleanUpAfterFinish(session integrationSession) {
	removeIntegrationWorkspace(s.git, session.OpenProjectPath, session.SessionID, session.WorkspacePath)
	if ref, err := integrationResultRef(session.SessionID); err == nil {
		s.git.RunGit(session.OpenProjectPath, "update-ref", "-d", ref)
	}
}

// destinationWorktreePath reports which working directory has destinationRef
// checked out, or an empty string when none does.
func destinationWorktreePath(runner gitAdminPathRunner, repoPath string, destinationRef string) (string, error) {
	result := runner.RunGit(repoPath, "worktree", "list", "--porcelain")
	if !result.Success {
		return "", fmt.Errorf("failed to list working copies: %s", getErrorMessage(result))
	}

	current := ""
	for _, line := range strings.Split(result.Stdout, "\n") {
		line = strings.TrimRight(line, "\r")
		if path, found := strings.CutPrefix(line, "worktree "); found {
			current = path
			continue
		}
		if branch, found := strings.CutPrefix(line, "branch "); found && branch == destinationRef {
			return current, nil
		}
	}
	return "", nil
}

// sameWorkingCopy compares two working directory paths. git reports the
// resolved path, so a project opened through a symlink would otherwise look
// like a different project entirely.
func sameWorkingCopy(left string, right string) bool {
	return sameRepositoryPath(normalizeRepositoryKey(left), normalizeRepositoryKey(right))
}

// --- session bookkeeping ---------------------------------------------------

func (s *IntegrationSessionService) revisionsStillMatch(session integrationSession) bool {
	source, sourceOK := s.revision(session.OpenProjectPath, session.SourceRef)
	destination, destinationOK := s.revision(session.OpenProjectPath, session.DestinationRef)
	return sourceOK && destinationOK && source == session.SourceOID && destination == session.DestinationOID
}

func (s *IntegrationSessionService) sessionMatchesTarget(session integrationSession, target integrationTarget, mode string) bool {
	return session.MergeMode == mode &&
		session.SourceRef == target.sourceRef &&
		session.SourceOID == target.sourceOID &&
		session.DestinationRef == target.destinationRef &&
		session.DestinationOID == target.destinationOID
}

// integrationSessionIsUsable reports whether a session still has an answer the
// user can act on, as opposed to one that needs redoing.
func integrationSessionIsUsable(session integrationSession) bool {
	return session.State == integrationStateReady || session.State == integrationStateNeedsDecisions
}

// currentSession returns the newest non-terminal session for a repository.
func (s *IntegrationSessionService) currentSession(identity string) (integrationSession, bool) {
	sessions, err := s.store.list()
	if err != nil {
		return integrationSession{}, false
	}

	found := false
	newest := integrationSession{}
	for _, session := range sessions {
		if session.RepositoryCommonDir != identity || integrationSessionTerminalStates[session.State] {
			continue
		}
		// list is sorted oldest first, so the last match is the newest.
		newest = session
		found = true
	}
	return newest, found
}

// replaceSession retires a session whose answer no longer applies. It is marked
// obsolete before cleanup begins, so a late result can be recognized and
// dropped by session id rather than being mistaken for the current one.
func (s *IntegrationSessionService) replaceSession(session integrationSession) {
	session.State = integrationStateObsolete
	session.UpdatedAt = time.Now().Unix()
	if err := s.store.save(session); err != nil {
		return
	}
	s.emit(session)
	cancelIntegrationSession(s.git, s.store, session)
}

func (s *IntegrationSessionService) transition(session *integrationSession, state string, failure string) error {
	session.State = state
	session.Error = failure
	session.UpdatedAt = time.Now().Unix()
	return s.store.save(*session)
}

func (s *IntegrationSessionService) claimPreparation(identity string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.preparing[identity] {
		return false
	}
	s.preparing[identity] = true
	return true
}

func (s *IntegrationSessionService) releasePreparation(identity string) {
	s.mu.Lock()
	delete(s.preparing, identity)
	s.mu.Unlock()
}

func (s *IntegrationSessionService) publishMutation(repoPath string) {
	if s.bus != nil {
		s.bus.Publish(RepoMutated{RepoPath: repoPath, Reason: RepoMutationMerge})
	}
}

// --- snapshots -------------------------------------------------------------

func (s *IntegrationSessionService) snapshot(session integrationSession) IntegrationSessionSnapshot {
	return IntegrationSessionSnapshot{
		SessionID:      session.SessionID,
		State:          session.State,
		Message:        s.messageFor(session.State),
		MergeMode:      session.MergeMode,
		SourceBranch:   strings.TrimPrefix(session.SourceRef, "refs/heads/"),
		SourceOID:      session.SourceOID,
		TargetBranch:   strings.TrimPrefix(session.DestinationRef, "refs/heads/"),
		DestinationOID: session.DestinationOID,
		Generation:     session.Generation,
		HasResult:      strings.TrimSpace(session.ResultOID) != "",
		Active:         integrationSessionIsUsable(session),
		Error:          session.Error,
		UpdatedAt:      session.UpdatedAt,
	}
}

func (s *IntegrationSessionService) failedSnapshot(err error) IntegrationSessionSnapshot {
	return IntegrationSessionSnapshot{
		State:     integrationStateFailed,
		Message:   integrationSessionOutcomeMessages[integrationStateFailed],
		Error:     err.Error(),
		UpdatedAt: time.Now().Unix(),
	}
}

func (s *IntegrationSessionService) messageFor(state string) string {
	if message, found := integrationSessionOutcomeMessages[state]; found {
		return message
	}
	return integrationSessionOutcomeMessages[integrationStateFailed]
}

func (s *IntegrationSessionService) emit(session integrationSession) IntegrationSessionSnapshot {
	snapshot := s.snapshot(session)
	if s.app != nil {
		s.app.Event.Emit(IntegrationSessionChangedEvent, snapshot)
	}
	return snapshot
}
