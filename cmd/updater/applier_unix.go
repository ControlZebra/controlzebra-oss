//go:build !windows

package main

import (
	"os"
	"syscall"
)

// signalZero returns the Unix "signal 0" used to check if a process is alive.
// Sending signal 0 to a PID doesn't deliver any signal, but the kernel still
// performs permission and existence checks — returning an error if the process
// doesn't exist.
func signalZero() os.Signal {
	return syscall.Signal(0)
}
