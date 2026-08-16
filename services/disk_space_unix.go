//go:build !windows

package services

import "golang.org/x/sys/unix"

// availableDiskBytes reports the space usable by this user at path.
func availableDiskBytes(path string) (uint64, error) {
	var stat unix.Statfs_t
	if err := unix.Statfs(path, &stat); err != nil {
		return 0, err
	}
	return uint64(stat.Bavail) * uint64(stat.Bsize), nil
}
