package services

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// Phase 0 of the Isolated Conflict Resolution Plan. These tests prove the Git
// mechanics the isolated integration session will depend on, against real Git,
// before any service code exists. Nothing here imports service types on
// purpose: if the mechanics do not hold, the design does not hold.

// integrationResultRefPrefix mirrors the private namespace the session service
// will use, so the unreachability assertions exercise the real ref location.
const integrationResultRefPrefix = "refs/controlzebra/integration/"

// integrationFixture is a repository shaped like the real scenario: the
// destination branch is checked out in the open project and the source branch
// lives in a linked worktree.
type integrationFixture struct {
	openProject    string
	linkedWorktree string
	destination    string
	source         string
}

// newLinkedWorktreeRepo builds that fixture. The linked worktree matters
// because every Git administrative path assumption in the current codebase
// breaks the moment more than one worktree exists.
func newLinkedWorktreeRepo(t *testing.T) integrationFixture {
	t.Helper()

	openProject := createTestRepo(t)
	t.Cleanup(func() { os.RemoveAll(openProject) })

	runGitCmd(t, openProject, "config", "core.autocrlf", "false")
	commitFileAt(t, openProject, "shared.txt", "base\n", "base")
	runGitCmd(t, openProject, "branch", "-M", "main")
	runGitCmd(t, openProject, "branch", "feature")

	linked := filepath.Join(t.TempDir(), "feature-worktree")
	runGitCmd(t, openProject, "worktree", "add", linked, "feature")

	return integrationFixture{
		openProject:    openProject,
		linkedWorktree: linked,
		destination:    "main",
		source:         "feature",
	}
}

func commitFileAt(t *testing.T, dir string, relPath string, content string, message string) string {
	t.Helper()
	fullPath := filepath.Join(dir, filepath.FromSlash(relPath))
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		t.Fatalf("create directory for %s: %v", relPath, err)
	}
	if err := os.WriteFile(fullPath, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", relPath, err)
	}
	runGitCmd(t, dir, "add", "--", relPath)
	runGitCmd(t, dir, "commit", "-m", message)
	return revParse(t, dir, "HEAD")
}

func revParse(t *testing.T, dir string, rev string) string {
	t.Helper()
	return strings.TrimSpace(runGitOutput(t, dir, "rev-parse", rev))
}

func runGitAllowFail(t *testing.T, dir string, args ...string) (string, error) {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	output, err := cmd.CombinedOutput()
	return string(output), err
}

// addIntegrationWorkspace creates the backend-owned worktree, detached at the
// destination revision so neither branch can move as a side effect.
func addIntegrationWorkspace(t *testing.T, repoPath string, destinationOID string) string {
	t.Helper()
	workspace := filepath.Join(t.TempDir(), "integration-workspace")
	runGitCmd(t, repoPath, "worktree", "add", "--detach", workspace, destinationOID)
	t.Cleanup(func() {
		runGitAllowFail(t, repoPath, "worktree", "remove", "--force", workspace)
	})
	return workspace
}

// runIntegrationMerge performs the real merge inside the workspace. A nil error
// means the merge left a clean, fully staged index.
func runIntegrationMerge(t *testing.T, workspace string, sourceOID string, squash bool) error {
	t.Helper()
	args := []string{"merge", "--no-commit", "--no-ff", sourceOID}
	if squash {
		args = []string{"merge", "--squash", sourceOID}
	}
	_, err := runGitAllowFail(t, workspace, args...)
	return err
}

// createIntegrationResult writes the prepared result. commit-tree is the chosen
// primitive because it takes explicit parents and cannot run repository hooks.
func createIntegrationResult(t *testing.T, workspace string, destinationOID string, sourceOID string, squash bool) string {
	t.Helper()
	treeOID := strings.TrimSpace(runGitOutput(t, workspace, "write-tree"))
	args := []string{"commit-tree", treeOID, "-p", destinationOID}
	if !squash {
		args = append(args, "-p", sourceOID)
	}
	args = append(args, "-m", "prepared integration result")
	return strings.TrimSpace(runGitOutput(t, workspace, args...))
}

func parentsOf(t *testing.T, dir string, oid string) []string {
	t.Helper()
	fields := strings.Fields(runGitOutput(t, dir, "rev-list", "--parents", "-n", "1", oid))
	if len(fields) == 0 {
		t.Fatalf("no rev-list output for %s", oid)
	}
	return fields[1:]
}

// plantFailingHooks installs hooks that record they ran and then fail. They
// live in the common directory, so every linked worktree shares them.
func plantFailingHooks(t *testing.T, repoPath string, markerDir string, names ...string) {
	t.Helper()
	hooksDir := filepath.Join(repoPath, ".git", "hooks")
	if err := os.MkdirAll(hooksDir, 0o755); err != nil {
		t.Fatalf("create hooks directory: %v", err)
	}
	for _, name := range names {
		script := "#!/bin/sh\ntouch " + filepath.Join(markerDir, name) + "\nexit 1\n"
		if err := os.WriteFile(filepath.Join(hooksDir, name), []byte(script), 0o755); err != nil {
			t.Fatalf("write %s hook: %v", name, err)
		}
	}
}

func TestIntegrationHarnessConflictingMergeLeavesWorkspaceUnmerged(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)

	sourceOID := commitFileAt(t, fixture.linkedWorktree, "shared.txt", "line\nfeature\n", "feature edit")
	destinationOID := commitFileAt(t, fixture.openProject, "shared.txt", "line\nmain\n", "main edit")

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, false); err == nil {
		t.Fatal("expected the merge to report conflicts")
	}

	stages := runGitOutput(t, workspace, "ls-files", "-u", "--", "shared.txt")
	for _, stage := range []string{" 1\t", " 2\t", " 3\t"} {
		if !strings.Contains(stages, stage) {
			t.Fatalf("expected stage%s for shared.txt, got:\n%s", strings.TrimSpace(stage), stages)
		}
	}

	// The whole point: the open project never notices.
	if got := revParse(t, fixture.openProject, "HEAD"); got != destinationOID {
		t.Fatalf("open project HEAD moved to %s, expected %s", got, destinationOID)
	}
	if status := runGitOutput(t, fixture.openProject, "status", "--porcelain"); strings.TrimSpace(status) != "" {
		t.Fatalf("open project is dirty after preparation:\n%s", status)
	}
}

func TestIntegrationHarnessRegularResultHasTwoParentsInOrder(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)

	sourceOID := commitFileAt(t, fixture.linkedWorktree, "feature.txt", "feature\n", "feature file")
	destinationOID := commitFileAt(t, fixture.openProject, "main.txt", "main\n", "main file")

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, false); err != nil {
		t.Fatalf("expected a clean merge: %v", err)
	}
	resultOID := createIntegrationResult(t, workspace, destinationOID, sourceOID, false)

	parents := parentsOf(t, fixture.openProject, resultOID)
	if len(parents) != 2 || parents[0] != destinationOID || parents[1] != sourceOID {
		t.Fatalf("expected parents [%s %s], got %v", destinationOID, sourceOID, parents)
	}
}

func TestIntegrationHarnessSquashResultHasSingleParentAndMatchingTree(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)

	commitFileAt(t, fixture.linkedWorktree, "feature.txt", "feature\n", "feature file")
	sourceOID := commitFileAt(t, fixture.linkedWorktree, "feature.txt", "feature revised\n", "feature follow-up")
	destinationOID := commitFileAt(t, fixture.openProject, "main.txt", "main\n", "main file")

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, true); err != nil {
		t.Fatalf("expected a clean squash merge: %v", err)
	}
	resultOID := createIntegrationResult(t, workspace, destinationOID, sourceOID, true)

	parents := parentsOf(t, fixture.openProject, resultOID)
	if len(parents) != 1 || parents[0] != destinationOID {
		t.Fatalf("expected single parent %s, got %v", destinationOID, parents)
	}

	// Control: the same squash performed through git's ordinary commit path.
	control := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, control, sourceOID, true); err != nil {
		t.Fatalf("control squash merge failed: %v", err)
	}
	runGitCmd(t, control, "commit", "--no-verify", "-m", "control squash")

	if got, want := revParse(t, fixture.openProject, resultOID+"^{tree}"), revParse(t, control, "HEAD^{tree}"); got != want {
		t.Fatalf("squash result tree %s does not match git merge --squash tree %s", got, want)
	}
}

func TestIntegrationHarnessResultCreationSkipsRepositoryHooks(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)

	markerDir := t.TempDir()
	sourceOID := commitFileAt(t, fixture.linkedWorktree, "feature.txt", "feature\n", "feature file")
	destinationOID := revParse(t, fixture.openProject, "main")

	// Planted after the fixture commits so only preparation can trip them.
	plantFailingHooks(t, fixture.openProject, markerDir, "pre-commit", "commit-msg", "prepare-commit-msg", "post-merge")

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, false); err != nil {
		t.Fatalf("expected a clean merge: %v", err)
	}
	resultOID := createIntegrationResult(t, workspace, destinationOID, sourceOID, false)
	if resultOID == "" {
		t.Fatal("expected a prepared result")
	}

	entries, err := os.ReadDir(markerDir)
	if err != nil {
		t.Fatalf("read hook markers: %v", err)
	}
	if len(entries) != 0 {
		names := []string{}
		for _, entry := range entries {
			names = append(names, entry.Name())
		}
		t.Fatalf("project hooks ran during preparation: %v", names)
	}
}

func TestIntegrationHarnessPreparedResultIsUnreachableFromBranches(t *testing.T) {
	fixture := newLinkedWorktreeRepo(t)

	sourceOID := commitFileAt(t, fixture.linkedWorktree, "feature.txt", "feature\n", "feature file")
	destinationOID := commitFileAt(t, fixture.openProject, "main.txt", "main\n", "main file")

	workspace := addIntegrationWorkspace(t, fixture.openProject, destinationOID)
	if err := runIntegrationMerge(t, workspace, sourceOID, false); err != nil {
		t.Fatalf("expected a clean merge: %v", err)
	}
	resultOID := createIntegrationResult(t, workspace, destinationOID, sourceOID, false)
	runGitCmd(t, fixture.openProject, "update-ref", integrationResultRefPrefix+"session-1", resultOID)

	if containing := strings.TrimSpace(runGitOutput(t, fixture.openProject, "branch", "--all", "--contains", resultOID)); containing != "" {
		t.Fatalf("prepared result is reachable from branches:\n%s", containing)
	}

	heads := strings.Fields(runGitOutput(t, fixture.openProject, "for-each-ref", "--format=%(refname)", "refs/heads"))
	if len(heads) == 0 {
		t.Fatal("expected at least one branch to check")
	}
	for _, head := range heads {
		if _, err := runGitAllowFail(t, fixture.openProject, "merge-base", "--is-ancestor", resultOID, head); err == nil {
			t.Fatalf("prepared result is an ancestor of %s", head)
		}
	}
}
