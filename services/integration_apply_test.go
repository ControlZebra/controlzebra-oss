package services

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Phase 0 of the Isolated Conflict Resolution Plan: prove the guarded
// application sequence against a destination that is checked out in the open
// project. `git merge --ff-only` is the primitive because the prepared result
// is always built on the captured destination revision, so a fast-forward
// updates the ref, index, and working files together, and refuses on its own
// rather than overwriting local work.

// preparedIntegration is a prepared, unapplied result plus the revisions it was
// captured against.
type preparedIntegration struct {
	fixture        integrationFixture
	destinationOID string
	sourceOID      string
	resultOID      string
}

// newPreparedIntegration builds a conflict-free result whose source touches
// sourcePath, so tests can put local work on an affected path.
func newPreparedIntegration(t *testing.T, sourcePath string) preparedIntegration {
	t.Helper()

	fixture := newLinkedWorktreeRepo(t)
	sourceOID := commitFileAt(t, fixture.linkedWorktree, sourcePath, "from feature\n", "feature edit")
	destinationOID := revParse(t, fixture.openProject, fixture.destination)

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, false); err != nil {
		t.Fatalf("expected a clean merge: %v", err)
	}
	resultOID := createIntegrationResult(t, workspace, destinationOID, sourceOID, false)
	runGitCmd(t, fixture.openProject, "update-ref", integrationResultRefPrefix+"apply-test", resultOID)

	return preparedIntegration{
		fixture:        fixture,
		destinationOID: destinationOID,
		sourceOID:      sourceOID,
		resultOID:      resultOID,
	}
}

func (p preparedIntegration) apply(t *testing.T) (string, error) {
	t.Helper()
	return runGitAllowFail(t, p.fixture.openProject, "merge", "--ff-only", p.resultOID)
}

// assertNotHalfApplied checks the destination ref, index, and working files all
// agree, and that they sit at either the captured destination or the result.
func (p preparedIntegration) assertNotHalfApplied(t *testing.T, stage string) {
	t.Helper()
	head := revParse(t, p.fixture.openProject, "HEAD")
	if head != p.destinationOID && head != p.resultOID {
		t.Fatalf("%s: destination is at %s, expected %s or %s", stage, head, p.destinationOID, p.resultOID)
	}
	if branch := revParse(t, p.fixture.openProject, p.fixture.destination); branch != head {
		t.Fatalf("%s: branch ref %s does not match HEAD %s", stage, branch, head)
	}
	if _, err := runGitAllowFail(t, p.fixture.openProject, "diff", "--quiet", "HEAD"); err != nil {
		t.Fatalf("%s: index or working files do not match the destination revision", stage)
	}
}

func (p preparedIntegration) assertFullyApplied(t *testing.T) {
	t.Helper()
	if head := revParse(t, p.fixture.openProject, "HEAD"); head != p.resultOID {
		t.Fatalf("expected destination at %s, got %s", p.resultOID, head)
	}
	if branch := revParse(t, p.fixture.openProject, p.fixture.destination); branch != p.resultOID {
		t.Fatalf("expected branch %s at %s, got %s", p.fixture.destination, p.resultOID, branch)
	}
	if status := strings.TrimSpace(runGitOutput(t, p.fixture.openProject, "status", "--porcelain")); status != "" {
		t.Fatalf("expected a clean project after applying, got:\n%s", status)
	}
}

func TestIntegrationApplyUpdatesCheckedOutDestination(t *testing.T) {
	prepared := newPreparedIntegration(t, "feature.txt")

	if output, err := prepared.apply(t); err != nil {
		t.Fatalf("apply failed: %v\n%s", err, output)
	}

	prepared.assertFullyApplied(t)
	content, err := os.ReadFile(filepath.Join(prepared.fixture.openProject, "feature.txt"))
	if err != nil {
		t.Fatalf("expected the source file in the working directory: %v", err)
	}
	if string(content) != "from feature\n" {
		t.Fatalf("unexpected working file content: %q", string(content))
	}
}

func TestIntegrationApplyBlockedByLocalWorkOnAffectedPath(t *testing.T) {
	cases := map[string]struct {
		sourcePath string
		setup      func(t *testing.T, openProject string)
	}{
		"unstaged edit": {
			sourcePath: "shared.txt",
			setup: func(t *testing.T, openProject string) {
				writeWorkingFile(t, openProject, "shared.txt", "local unsaved work\n")
			},
		},
		"staged edit": {
			sourcePath: "shared.txt",
			setup: func(t *testing.T, openProject string) {
				writeWorkingFile(t, openProject, "shared.txt", "local staged work\n")
				runGitCmd(t, openProject, "add", "--", "shared.txt")
			},
		},
		"untracked file": {
			sourcePath: "feature.txt",
			setup: func(t *testing.T, openProject string) {
				writeWorkingFile(t, openProject, "feature.txt", "local untracked work\n")
			},
		},
	}

	for name, testCase := range cases {
		t.Run(name, func(t *testing.T) {
			prepared := newPreparedIntegration(t, testCase.sourcePath)
			testCase.setup(t, prepared.fixture.openProject)

			output, err := prepared.apply(t)
			if err == nil {
				t.Fatalf("expected apply to be refused, got:\n%s", output)
			}
			if head := revParse(t, prepared.fixture.openProject, "HEAD"); head != prepared.destinationOID {
				t.Fatalf("destination moved to %s despite refusal", head)
			}

			content, readErr := os.ReadFile(filepath.Join(prepared.fixture.openProject, testCase.sourcePath))
			if readErr != nil {
				t.Fatalf("local work was removed: %v", readErr)
			}
			if !strings.HasPrefix(string(content), "local ") {
				t.Fatalf("local work was overwritten: %q", string(content))
			}
		})
	}
}

func TestIntegrationApplyRefusesWhenAnotherWorktreeOwnsDestination(t *testing.T) {
	prepared := newPreparedIntegration(t, "feature.txt")
	openProject := prepared.fixture.openProject

	// Hand the destination to a linked worktree while the open project sits
	// elsewhere, which is what happens when the user has several projects open.
	runGitCmd(t, openProject, "checkout", "--detach")
	owner := filepath.Join(t.TempDir(), "destination-owner")
	runGitCmd(t, openProject, "worktree", "add", owner, prepared.fixture.destination)
	t.Cleanup(func() { runGitAllowFail(t, openProject, "worktree", "remove", "--force", owner) })

	worktrees := runGitOutput(t, openProject, "worktree", "list", "--porcelain")
	if !strings.Contains(worktrees, "branch refs/heads/"+prepared.fixture.destination) {
		t.Fatalf("expected a worktree to own the destination:\n%s", worktrees)
	}

	output, err := runGitAllowFail(t, openProject, "branch", "-f", prepared.fixture.destination, prepared.resultOID)
	if err == nil {
		t.Fatalf("expected git to refuse updating a destination owned elsewhere, got:\n%s", output)
	}
	if branch := revParse(t, openProject, prepared.fixture.destination); branch != prepared.destinationOID {
		t.Fatalf("destination moved to %s despite refusal", branch)
	}
}

// The guarded application sequence, expressed as discrete steps so the test can
// stop after each one. Phase 2 persists a checkpoint between these; here we only
// prove Git never leaves the destination half-applied.
func TestIntegrationApplyIsNeverHalfAppliedWhenInterrupted(t *testing.T) {
	steps := []string{"validate-revisions", "guard-clean-checkout", "fast-forward"}

	for stopAfter := 0; stopAfter <= len(steps); stopAfter++ {
		name := "stop-before-" + steps[0]
		if stopAfter > 0 {
			name = "stop-after-" + steps[stopAfter-1]
		}
		t.Run(name, func(t *testing.T) {
			prepared := newPreparedIntegration(t, "feature.txt")
			openProject := prepared.fixture.openProject

			for _, step := range steps[:stopAfter] {
				switch step {
				case "validate-revisions":
					if revParse(t, openProject, prepared.fixture.destination) != prepared.destinationOID {
						t.Fatal("destination revision changed before applying")
					}
					if revParse(t, openProject, prepared.fixture.source) != prepared.sourceOID {
						t.Fatal("source revision changed before applying")
					}
				case "guard-clean-checkout":
					if status := strings.TrimSpace(runGitOutput(t, openProject, "status", "--porcelain")); status != "" {
						t.Fatalf("destination checkout is not clean:\n%s", status)
					}
				case "fast-forward":
					if output, err := prepared.apply(t); err != nil {
						t.Fatalf("apply failed: %v\n%s", err, output)
					}
				}
			}

			prepared.assertNotHalfApplied(t, "interrupted after "+strings.Join(steps[:stopAfter], ", "))

			// Recovery re-runs the sequence from the top and must converge.
			if head := revParse(t, openProject, "HEAD"); head != prepared.resultOID {
				if output, err := prepared.apply(t); err != nil {
					t.Fatalf("recovery failed: %v\n%s", err, output)
				}
			}
			prepared.assertFullyApplied(t)
		})
	}
}

// A stale lock is the most common real interruption on Windows, where antivirus
// scanners hold files open after a crash.
func TestIntegrationApplyRecoversFromStaleIndexLock(t *testing.T) {
	prepared := newPreparedIntegration(t, "feature.txt")
	openProject := prepared.fixture.openProject

	lockPath := strings.TrimSpace(runGitOutput(t, openProject, "rev-parse", "--path-format=absolute", "--git-path", "index.lock"))
	if err := os.WriteFile(lockPath, nil, 0o644); err != nil {
		t.Fatalf("create stale lock: %v", err)
	}

	if output, err := prepared.apply(t); err == nil {
		t.Fatalf("expected apply to fail while a stale lock exists, got:\n%s", output)
	}
	prepared.assertNotHalfApplied(t, "stale lock present")

	if err := os.Remove(lockPath); err != nil {
		t.Fatalf("remove stale lock: %v", err)
	}
	if output, err := prepared.apply(t); err != nil {
		t.Fatalf("recovery after lock removal failed: %v\n%s", err, output)
	}
	prepared.assertFullyApplied(t)
}

func writeWorkingFile(t *testing.T, dir string, relPath string, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(relPath)), []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", relPath, err)
	}
}
