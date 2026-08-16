package services

import "sync"

// repositoryCoordinator serializes short repository mutations across every
// service that can move refs or rewrite the index. One table for the whole
// process, keyed on repository identity, so a Change Request fetch and an
// integration apply cannot interleave on the same repository.
//
// It guards start, apply, and cancel transitions only. Never hold it across a
// human review period.
type repositoryCoordinator struct {
	locks sync.Map
}

var sharedRepositoryCoordinator = &repositoryCoordinator{}

// repositoryCoordinatorRunner resolves repository identity. It is a variable so
// tests can substitute a fake.
var repositoryCoordinatorRunner gitAdminPathRunner = NewCommandRunner()

// lockRepo acquires the lock for the repository containing repoPath and
// returns its release function.
func (c *repositoryCoordinator) lockRepo(repoPath string) func() {
	return c.lockKey(repositoryLockKey(repositoryCoordinatorRunner, repoPath))
}

func (c *repositoryCoordinator) lockKey(key string) func() {
	value, _ := c.locks.LoadOrStore(key, &sync.Mutex{})
	mutex := value.(*sync.Mutex)
	mutex.Lock()
	return mutex.Unlock
}

// repositoryLockKey prefers the shared common directory. When git cannot answer
// it falls back to the caller's path, so a git failure degrades to the older,
// narrower guarantee instead of skipping the lock entirely.
func repositoryLockKey(runner gitAdminPathRunner, repoPath string) string {
	if identity, err := repositoryIdentity(runner, repoPath); err == nil {
		return identity
	}
	return normalizeRepositoryKey(repoPath)
}
