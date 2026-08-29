package services

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// defaultSyncTarget is resolved entirely from the checked-out branch's Git
// configuration. It intentionally does not use mergeTargetRef, whose feature
// workflow correctly excludes integration branches.
type defaultSyncTarget struct {
	sourceRef         string
	sourceOID         string
	pushRemoteName    string
	remoteTrackingRef string
	shareRef          string
}

// IsDefaultBranchSyncEligible is a read-only frontend preflight used to show
// the protected-default-branch confirmation before Sync mutates Git state.
func (s *IntegrationSessionService) IsDefaultBranchSyncEligible(repoPath string) bool {
	_, ok := s.resolveDefaultSyncTarget(strings.TrimSpace(repoPath))
	return ok
}

// BeginDefaultBranchSync records the restoration baseline before the existing
// ProgressService pull begins. Ineligible repositories remain on the legacy
// feature-branch Sync path.
//
//wails:ignore
func (s *IntegrationSessionService) BeginDefaultBranchSync(repoPath string) (string, bool, error) {
	repoPath = strings.TrimSpace(repoPath)
	target, eligible := s.resolveDefaultSyncTarget(repoPath)
	if !eligible {
		return "", false, nil
	}

	release := sharedRepositoryCoordinator.lockRepo(repoPath)
	defer release()

	if mergeInProgress(s.git, repoPath) {
		return "", true, fmt.Errorf("another merge is already in progress")
	}
	status := s.git.RunGit(repoPath, "status", "--porcelain")
	if !status.Success || strings.TrimSpace(status.Stdout) != "" {
		return "", true, fmt.Errorf("this project has unsaved files. Save or discard them before syncing")
	}

	identity := repositoryLockKey(s.git, repoPath)
	if existing, found := s.currentSession(identity); found {
		if sessionIsDefaultSync(existing) && existing.State == integrationStateStarting &&
			existing.SourceRef == target.sourceRef && existing.FeatureOIDBeforeMerge == target.sourceOID {
			return existing.SessionID, true, nil
		}
		if integrationSessionIsUsable(existing) {
			return "", true, fmt.Errorf("another update is already active for this project")
		}
		if err := s.store.delete(existing.SessionID); err != nil {
			return "", true, fmt.Errorf("couldn't replace the previous update record: %w", err)
		}
	}

	sessionID, err := newIntegrationSessionID()
	if err != nil {
		return "", true, err
	}
	now := time.Now().Unix()
	remoteOID, _ := s.revision(repoPath, target.remoteTrackingRef)
	session := integrationSession{
		SessionID:             sessionID,
		RepositoryCommonDir:   identity,
		OpenProjectPath:       repoPath,
		OperationKind:         "merge",
		UpdateKind:            integrationUpdateKindDefaultSync,
		SourceRef:             target.sourceRef,
		SourceOID:             target.sourceOID,
		DestinationRef:        target.remoteTrackingRef,
		DestinationOID:        remoteOID,
		RemoteName:            target.pushRemoteName,
		RemoteDestinationRef:  target.remoteTrackingRef,
		RemoteDestinationOID:  remoteOID,
		FeatureOIDBeforeMerge: target.sourceOID,
		ShareRef:              target.shareRef,
		State:                 integrationStateStarting,
		Generation:            uint64(now),
		CreatedAt:             now,
		UpdatedAt:             now,
	}
	if err := s.store.save(session); err != nil {
		return "", true, err
	}
	s.emit(session)
	return sessionID, true, nil
}

// ReconcileSyncPull adopts only the exact conflicted pull owned by sessionID.
// Git state, not command output text, is authoritative.
//
//wails:ignore
func (s *IntegrationSessionService) ReconcileSyncPull(sessionID string) (bool, error) {
	session, err := s.store.load(sessionID)
	if err != nil {
		return false, err
	}
	if !sessionIsDefaultSync(session) {
		return false, fmt.Errorf("session is not a default-branch sync")
	}

	release := sharedRepositoryCoordinator.lockRepo(session.OpenProjectPath)
	defer release()

	updated, needsDecisions, err := reconcileDefaultSyncPull(s.git, session)
	if err != nil || !needsDecisions {
		return false, err
	}
	if err := s.store.save(updated); err != nil {
		return false, err
	}
	s.emit(updated)
	entries, classifyErr := classifyConflictQueue(s.git, updated.OpenProjectPath)
	if classifyErr != nil {
		return false, classifyErr
	}
	s.emitConflicts(s.conflictSnapshot(updated, entries, nil))
	return true, nil
}

// CompleteSyncShare records the ordinary conflict-free pull-and-push path as
// terminal. The next startup removes the record with other shared sessions.
//
//wails:ignore
func (s *IntegrationSessionService) CompleteSyncShare(sessionID string) error {
	if strings.TrimSpace(sessionID) == "" {
		return nil
	}
	session, err := s.store.load(sessionID)
	if err != nil {
		return err
	}
	if !sessionIsDefaultSync(session) {
		return fmt.Errorf("session is not a default-branch sync")
	}
	afterOID, ok := s.revision(session.OpenProjectPath, session.SourceRef)
	if !ok {
		return fmt.Errorf("couldn't verify the default branch after pushing")
	}
	session.FeatureOIDAfterMerge = afterOID
	session.ResultOID = session.FeatureOIDAfterMerge
	session.State = integrationStateShared
	session.Error = ""
	session.UpdatedAt = time.Now().Unix()
	if err := s.store.save(session); err != nil {
		return err
	}
	s.emit(session)
	return nil
}

// FailSync drops an intent that never became an owned conflict. The caller
// keeps the existing Sync error behavior, and generic recovery remains in
// charge of any incompatible Git operation.
//
//wails:ignore
func (s *IntegrationSessionService) FailSync(sessionID string, _ error) {
	if strings.TrimSpace(sessionID) == "" {
		return
	}
	session, err := s.store.load(sessionID)
	if err != nil || !sessionIsDefaultSync(session) || session.State == integrationStateNeedsDecisions {
		return
	}
	if s.store.delete(sessionID) == nil {
		// Publish a non-visible terminal snapshot so a frontend that observed the
		// pre-pull intent does not retain stale "starting" status after a normal
		// Sync error.
		session.State = integrationStateCancelled
		session.UpdatedAt = time.Now().Unix()
		s.emit(session)
	}
}

func (s *IntegrationSessionService) resolveDefaultSyncTarget(repoPath string) (defaultSyncTarget, bool) {
	if repoPath == "" {
		return defaultSyncTarget{}, false
	}
	sourceRefResult := s.git.RunGit(repoPath, "symbolic-ref", "--quiet", "HEAD")
	sourceRef := strings.TrimSpace(sourceRefResult.Stdout)
	if !sourceRefResult.Success || !strings.HasPrefix(sourceRef, "refs/heads/") {
		return defaultSyncTarget{}, false
	}
	branch := strings.TrimPrefix(sourceRef, "refs/heads/")
	remoteName := strings.TrimSpace(s.git.RunGit(repoPath, "config", "--get", "branch."+branch+".remote").Stdout)
	upstreamRef := strings.TrimSpace(s.git.RunGit(repoPath, "config", "--get", "branch."+branch+".merge").Stdout)
	if remoteName == "" || remoteName == "." || !strings.HasPrefix(upstreamRef, "refs/heads/") {
		return defaultSyncTarget{}, false
	}
	remoteTrackingRef := "refs/remotes/" + remoteName + "/" + strings.TrimPrefix(upstreamRef, "refs/heads/")
	defaultResult := s.git.RunGit(repoPath, "symbolic-ref", "--quiet", "refs/remotes/"+remoteName+"/HEAD")
	if !defaultResult.Success || strings.TrimSpace(defaultResult.Stdout) != remoteTrackingRef {
		return defaultSyncTarget{}, false
	}
	sourceOID, ok := s.revision(repoPath, sourceRef)
	if !ok {
		return defaultSyncTarget{}, false
	}
	pushRemoteName, shareRef := s.resolveDefaultSyncPushTarget(repoPath, sourceRef, remoteName, upstreamRef)
	return defaultSyncTarget{
		sourceRef:         sourceRef,
		sourceOID:         sourceOID,
		pushRemoteName:    pushRemoteName,
		remoteTrackingRef: remoteTrackingRef,
		shareRef:          shareRef,
	}, true
}

// resolveDefaultSyncPushTarget follows Git's resolved @{push} destination when
// it is available (including pushRemote/remote.pushDefault). A differently
// named upstream commonly has no @{push} under push.default=simple, so the
// configured upstream is the narrow safe fallback.
func (s *IntegrationSessionService) resolveDefaultSyncPushTarget(
	repoPath string,
	sourceRef string,
	upstreamRemoteName string,
	upstreamRef string,
) (string, string) {
	result := s.git.RunGit(
		repoPath,
		"for-each-ref",
		"--format=%(push:remotename)%00%(push)",
		sourceRef,
	)
	parts := strings.SplitN(strings.TrimSpace(result.Stdout), "\x00", 2)
	if result.Success && len(parts) == 2 {
		pushRemoteName := strings.TrimSpace(parts[0])
		pushTrackingRef := strings.TrimSpace(parts[1])
		prefix := "refs/remotes/" + pushRemoteName + "/"
		if pushRemoteName != "" && strings.HasPrefix(pushTrackingRef, prefix) {
			return pushRemoteName, "refs/heads/" + strings.TrimPrefix(pushTrackingRef, prefix)
		}
	}
	return upstreamRemoteName, upstreamRef
}

type defaultSyncReconcileGit interface {
	gitAdminPathRunner
	conflictQueueGit
}

func reconcileDefaultSyncPull(runner defaultSyncReconcileGit, session integrationSession) (integrationSession, bool, error) {
	entries, err := classifyConflictQueue(runner, session.OpenProjectPath)
	if err != nil {
		return session, false, err
	}
	mergeHeads, err := readMergeHeads(runner, session.OpenProjectPath)
	if err != nil {
		return session, false, err
	}
	if len(mergeHeads) == 0 {
		if len(entries) > 0 {
			return session, false, fmt.Errorf("unmerged entries exist without an active merge")
		}
		return session, false, nil
	}
	if len(mergeHeads) != 1 || len(entries) == 0 {
		return session, false, fmt.Errorf("the pull did not leave one compatible conflicted merge")
	}

	head := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "rev-parse", "--verify", "HEAD^{commit}").Stdout)
	origHead := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "rev-parse", "--verify", "ORIG_HEAD^{commit}").Stdout)
	upstream := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "rev-parse", "--verify", session.RemoteDestinationRef+"^{commit}").Stdout)
	if head != session.FeatureOIDBeforeMerge || origHead != session.FeatureOIDBeforeMerge || upstream == "" || mergeHeads[0] != upstream {
		return session, false, fmt.Errorf("the active merge does not match the captured default-branch pull")
	}

	session.DestinationOID = upstream
	session.RemoteDestinationOID = upstream
	session.State = integrationStateNeedsDecisions
	session.Error = ""
	session.UpdatedAt = time.Now().Unix()
	return session, true, nil
}

// recoverCompletedDefaultSync converts a captured, no-longer-merging pull into
// an explicit-share checkpoint. This covers a restart after a conflict-free
// pull but before ProgressService recorded or completed its automatic push.
func recoverCompletedDefaultSync(runner gitAdminPathRunner, session integrationSession) (integrationSession, error) {
	currentRef := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "symbolic-ref", "--quiet", "HEAD").Stdout)
	if currentRef != session.SourceRef {
		return session, fmt.Errorf("the checked-out branch changed during Sync")
	}
	head := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "rev-parse", "--verify", "HEAD^{commit}").Stdout)
	upstream := strings.TrimSpace(runner.RunGit(session.OpenProjectPath, "rev-parse", "--verify", session.RemoteDestinationRef+"^{commit}").Stdout)
	if head == "" || upstream == "" {
		return session, fmt.Errorf("the Sync revisions could not be verified")
	}
	if !runner.RunGit(session.OpenProjectPath, "merge-base", "--is-ancestor", upstream, head).Success {
		return session, fmt.Errorf("the local branch does not contain the fetched default branch")
	}
	if head != session.FeatureOIDBeforeMerge &&
		!runner.RunGit(session.OpenProjectPath, "merge-base", "--is-ancestor", session.FeatureOIDBeforeMerge, head).Success {
		return session, fmt.Errorf("the local branch no longer contains the captured pre-pull revision")
	}

	session.DestinationOID = upstream
	session.RemoteDestinationOID = upstream
	session.FeatureOIDAfterMerge = head
	session.ResultOID = head
	session.State = integrationStateUpdated
	session.Error = ""
	session.UpdatedAt = time.Now().Unix()
	return session, nil
}

func readMergeHeads(runner gitAdminPathRunner, repoPath string) ([]string, error) {
	gitPath := runner.RunGit(repoPath, "rev-parse", "--git-path", "MERGE_HEAD")
	if !gitPath.Success {
		return nil, fmt.Errorf("couldn't locate MERGE_HEAD")
	}
	path := strings.TrimSpace(gitPath.Stdout)
	if !filepath.IsAbs(path) {
		path = filepath.Join(repoPath, path)
	}
	payload, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return strings.Fields(string(payload)), nil
}
