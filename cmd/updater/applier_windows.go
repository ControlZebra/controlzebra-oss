//go:build windows

package main

import (
	"os"
	"syscall"
)

// signalZero returns a signal used to probe process existence on Windows.
// On Windows, os.Process.Signal only supports os.Kill and os.Interrupt.
// We use signal 0 (which Go will translate to a process existence check).
// Note: On Windows, isProcessRunning uses a different strategy (OpenProcess),
// but this is here for compilation compatibility.
func signalZero() os.Signal {
	return syscall.Signal(0)
}
