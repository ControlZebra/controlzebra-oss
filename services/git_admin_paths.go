package services

import (
	"fmt"
	"strings"
)

// Git administrative files are not always under <repo>/.git. In a linked
// worktree, .git is a file, per-worktree state such as MERGE_HEAD and
// index.lock lives under <common-dir>/worktrees/<name>, and shared state such
// as hooks and config stays in the common directory. Guessing the layout is
// what breaks the moment a repository has more than one worktree, so ask git.

// gitAdminPathRunner is the slice of CommandRunner these helpers need, kept
// narrow so tests can supply a fake.
type gitAdminPathRunner interface {
	RunGit(repoPath string, args ...string) CommandResult
}

// gitAdminPaths resolves administrative paths for the given names in one
// rev-parse call, returned in the order requested. git decides per name whether
// it belongs to this worktree or to the common directory.
func gitAdminPaths(runner gitAdminPathRunner, repoPath string, names ...string) ([]string, error) {
	if len(names) == 0 {
		return nil, nil
	}

	args := make([]string, 0, 2+len(names)*2)
	args = append(args, "rev-parse", "--path-format=absolute")
	for _, name := range names {
		if strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("empty git path name")
		}
		args = append(args, "--git-path", name)
	}

	result := runner.RunGit(repoPath, args...)
	if !result.Success {
		return nil, fmt.Errorf("failed to resolve git paths: %s", getErrorMessage(result))
	}

	paths := splitGitAdminPathOutput(result.Stdout)
	if len(paths) != len(names) {
		return nil, fmt.Errorf("expected %d git paths, git returned %d", len(names), len(paths))
	}
	return paths, nil
}

// gitAdminPath resolves a single administrative path.
func gitAdminPath(runner gitAdminPathRunner, repoPath string, name string) (string, error) {
	paths, err := gitAdminPaths(runner, repoPath, name)
	if err != nil {
		return "", err
	}
	return paths[0], nil
}

// gitDirPath returns the administrative directory for this worktree.
func gitDirPath(runner gitAdminPathRunner, repoPath string) (string, error) {
	return singleGitRevParsePath(runner, repoPath, "--git-dir")
}

// gitCommonDirPath returns the administrative directory shared by every
// worktree of the repository. It is the repository's identity.
func gitCommonDirPath(runner gitAdminPathRunner, repoPath string) (string, error) {
	return singleGitRevParsePath(runner, repoPath, "--git-common-dir")
}

func singleGitRevParsePath(runner gitAdminPathRunner, repoPath string, flag string) (string, error) {
	result := runner.RunGit(repoPath, "rev-parse", "--path-format=absolute", flag)
	if !result.Success {
		return "", fmt.Errorf("failed to resolve %s: %s", flag, getErrorMessage(result))
	}

	paths := splitGitAdminPathOutput(result.Stdout)
	if len(paths) != 1 {
		return "", fmt.Errorf("expected one path for %s, git returned %d", flag, len(paths))
	}
	return paths[0], nil
}

func splitGitAdminPathOutput(stdout string) []string {
	paths := []string{}
	for _, line := range strings.Split(stdout, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			paths = append(paths, trimmed)
		}
	}
	return paths
}
