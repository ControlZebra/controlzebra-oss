package services

import (
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// A repository is identified by the directory all of its worktrees share, not
// by the path the caller happened to open. Two linked worktrees of one project
// must resolve to one identity, otherwise "one active review per repository"
// and per-repository serialization both silently stop working.

// repositoryIdentityCache maps a caller path to its resolved identity. A
// repository never changes its common directory, so this is safe to keep for
// the process lifetime.
var repositoryIdentityCache sync.Map

// repositoryIdentity returns the canonical key for the repository containing
// repoPath.
func repositoryIdentity(runner gitAdminPathRunner, repoPath string) (string, error) {
	cacheKey := normalizeRepositoryKey(repoPath)
	if cached, found := repositoryIdentityCache.Load(cacheKey); found {
		return cached.(string), nil
	}

	commonDir, err := gitCommonDirPath(runner, repoPath)
	if err != nil {
		return "", err
	}

	identity := normalizeRepositoryKey(commonDir)
	repositoryIdentityCache.Store(cacheKey, identity)
	return identity, nil
}

// normalizeRepositoryKey folds a filesystem path into a comparable key.
// Symlinks are resolved so two routes to one repository agree, and Windows
// paths are compared case-insensitively because the filesystem is.
func normalizeRepositoryKey(path string) string {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if resolved, err := filepath.EvalSymlinks(cleaned); err == nil {
		cleaned = resolved
	}
	if runtime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}
	return cleaned
}
