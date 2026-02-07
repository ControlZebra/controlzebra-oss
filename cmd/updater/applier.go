package main
package main

import (
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"time"
)

// runApply implements the "cz-updater apply" subcommand.
//
// This is the critical step. The main app spawns this as a **detached process**
// and then exits. The sidecar:
//  1. Waits for the main app process (by PID) to exit
//  2. Renames the current binary to <name>.old (backup)
//  3. Moves the staged binary into place
//  4. Sets executable permissions (Unix)
//  5. Optionally relaunches the new binary
//  6. Cleans up the backup and staging directory
//
// If any step fails, the old binary is restored and the user has a working app.
//
// Usage:
//
//	cz-updater apply --staged <path> --target <path> --pid <pid> [--launch] [--log <path>]
func runApply(args []string) error {
	fs := flag.NewFlagSet("apply", flag.ContinueOnError)

	var (
		stagedPath string
		targetPath string
		pidStr     string
		launch     bool
		logPath    string
	)

	fs.StringVar(&stagedPath, "staged", "", "Path to the downloaded staged binary (required)")
	fs.StringVar(&targetPath, "target", "", "Path to the current running binary to replace (required)")
	fs.StringVar(&pidStr, "pid", "", "PID of the main app process to wait for (required)")
	fs.BoolVar(&launch, "launch", false, "Relaunch the app after applying the update")
	fs.StringVar(&logPath, "log", "", "Path to log file (default: <temp>/cz-updater.log)")

	if err := fs.Parse(args); err != nil {
		return err
	}

	// Set up logging — the main app has exited so we can't use stdout
	if logPath == "" {
		logPath = filepath.Join(os.TempDir(), "cz-updater.log")
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		// If we can't open a log file, use stderr as fallback
		log.SetOutput(os.Stderr)
		log.Printf("warning: could not open log file %s: %v", logPath, err)
	} else {
		defer logFile.Close()
		log.SetOutput(logFile)
	}

	log.Printf("cz-updater apply starting (version %s)", Version)
	log.Printf("  staged: %s", stagedPath)
	log.Printf("  target: %s", targetPath)
	log.Printf("  pid:    %s", pidStr)
	log.Printf("  launch: %v", launch)

	// Validate required flags
	if stagedPath == "" {
		return fmt.Errorf("--staged is required")
	}
	if targetPath == "" {
		return fmt.Errorf("--target is required")
	}
	if pidStr == "" {
		return fmt.Errorf("--pid is required")
	}

	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return fmt.Errorf("invalid PID %q: %w", pidStr, err)
	}

	// Step 1: Verify the staged file exists
	stagedInfo, err := os.Stat(stagedPath)
	if err != nil {
		return fmt.Errorf("staged binary not found: %w", err)
	}
	if stagedInfo.Size() == 0 {
		return fmt.Errorf("staged binary is empty (0 bytes)")
	}
	log.Printf("staged binary verified: %d bytes", stagedInfo.Size())

	// Step 2: Wait for the main app process to exit
	log.Printf("waiting for PID %d to exit...", pid)
	if err := waitForProcessExit(pid, 30*time.Second); err != nil {
		return fmt.Errorf("failed waiting for main app to exit: %w", err)
	}
	log.Println("main app process has exited")

	// Step 3: Rename current binary → <name>.old (backup)
	backupPath := targetPath + ".old"
	log.Printf("backing up %s → %s", targetPath, backupPath)
	if err := os.Rename(targetPath, backupPath); err != nil {
		return fmt.Errorf("failed to back up current binary: %w (is it still locked?)", err)
	}
	log.Println("backup complete")

	// Step 4: Move staged binary into place
	log.Printf("installing %s → %s", stagedPath, targetPath)
	if err := moveOrCopy(stagedPath, targetPath); err != nil {
		// CRITICAL: Restore the backup so the user still has a working app
		log.Printf("ERROR: failed to install new binary: %v", err)
		log.Println("restoring backup...")
		if restoreErr := os.Rename(backupPath, targetPath); restoreErr != nil {
			log.Printf("CRITICAL: failed to restore backup: %v", restoreErr)
			return fmt.Errorf("install failed (%w) AND backup restore failed (%v) — manual recovery needed", err, restoreErr)
		}
		log.Println("backup restored successfully")
		return fmt.Errorf("failed to install new binary (backup restored): %w", err)
	}
	log.Println("new binary installed")

	// Step 5: Set executable permissions (Unix only)
	if runtime.GOOS != "windows" {
		if err := os.Chmod(targetPath, 0o755); err != nil {
			log.Printf("warning: failed to set executable permission: %v", err)
			// Non-fatal on some systems, but log it
		}
	}

	// Step 6: Relaunch the new binary if requested
	if launch {
		log.Printf("launching %s", targetPath)
		cmd := exec.Command(targetPath)
		cmd.Stdout = nil
		cmd.Stderr = nil
		cmd.Stdin = nil
		if err := cmd.Start(); err != nil {
			log.Printf("warning: failed to relaunch app: %v", err)
			// Non-fatal — user can start the app manually
		} else {
			log.Printf("app relaunched with PID %d", cmd.Process.Pid)
			// Release so we don't wait for it
			cmd.Process.Release()
		}
	}

	// Step 7: Clean up backup and staging directory
	log.Println("cleaning up...")
	if err := os.Remove(backupPath); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: could not remove backup %s: %v", backupPath, err)
	}

	stagingDir := filepath.Dir(stagedPath)
	if filepath.Base(stagingDir) == "cz-update-staging" {
		if err := os.RemoveAll(stagingDir); err != nil {
			log.Printf("warning: could not remove staging dir %s: %v", stagingDir, err)
		}
	}

	log.Println("update applied successfully")
	return nil
}

// waitForProcessExit polls for a process to exit. Returns nil once the process
// is no longer running, or an error on timeout.
func waitForProcessExit(pid int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if !isProcessRunning(pid) {
			return nil
		}
		time.Sleep(500 * time.Millisecond)
	}
	return fmt.Errorf("timed out waiting for PID %d to exit after %v", pid, timeout)
}

// isProcessRunning checks whether a process with the given PID is alive.
// On Unix, we send signal 0 which doesn't actually kill the process but
// returns an error if it doesn't exist. On Windows, we use OpenProcess.
func isProcessRunning(pid int) bool {
	proc, err := os.FindProcess(pid)
	if err != nil {
		return false
	}
	// On Unix, FindProcess always succeeds — we need to send signal 0 to check.
	// On Windows, FindProcess checks if the handle is valid.
	if runtime.GOOS == "windows" {
		// On Windows, if FindProcess succeeds the process exists.
		// We release the handle and check via a signal.
		proc.Release()
	}

	// Signal 0: no signal sent, but error checking is performed
	err = proc.Signal(os.Signal(signalZero()))
	return err == nil
}

// moveOrCopy first tries an os.Rename (atomic on same filesystem). If that fails
// (e.g., cross-device move on Windows), it falls back to copy + remove.
func moveOrCopy(src, dst string) error {
	// Try rename first — atomic and fast
	if err := os.Rename(src, dst); err == nil {
		return nil
	}

	// Fallback: copy then remove source
	return copyFile(src, dst)
}

// copyFile copies a file from src to dst, preserving permissions.
func copyFile(src, dst string) error {
	srcFile, err := os.Open(src)
	if err != nil {
		return fmt.Errorf("open source: %w", err)
	}
	defer srcFile.Close()

	srcInfo, err := srcFile.Stat()
	if err != nil {
		return fmt.Errorf("stat source: %w", err)
	}

	dstFile, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, srcInfo.Mode())
	if err != nil {
		return fmt.Errorf("create destination: %w", err)
	}
	defer dstFile.Close()

	if _, err := io.Copy(dstFile, srcFile); err != nil {
		return fmt.Errorf("copy data: %w", err)
	}

	if err := dstFile.Close(); err != nil {
		return fmt.Errorf("close destination: %w", err)
	}

	// Remove the source file after successful copy
	if err := os.Remove(src); err != nil {
		// Non-fatal — the new binary is already in place
		log.Printf("warning: could not remove source after copy: %v", err)
	}

	return nil
}
