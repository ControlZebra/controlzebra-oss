//go:build !windows

package services

import "os"

func replaceFileAtomic(source string, destination string) error {
	return os.Rename(source, destination)
}
