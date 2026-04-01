//go:build windows

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

func runApplyWindowsInstallerPlatform(opts windowsInstallerApplyOptions) error {
	logPath := opts.logPath
	if logPath == "" {
		logPath = filepath.Join(os.TempDir(), "cz-updater.log")
	}
	logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		log.SetOutput(os.Stderr)
		log.Printf("warning: could not open log file %s: %v", logPath, err)
	} else {
		defer logFile.Close()
		log.SetOutput(logFile)
	}

	installDir := resolveWindowsInstallDir(opts.installDir, os.Getenv)
	executablePath := resolveWindowsInstalledExecutablePath(installDir)

	log.Printf("cz-updater apply-windows-installer starting (version %s)", Version)
	log.Printf("  installer:   %s", opts.installerPath)
	log.Printf("  pid:         %d", opts.pid)
	log.Printf("  install dir: %s", installDir)
	log.Printf("  relaunch:    %s", executablePath)

	installerInfo, err := os.Stat(opts.installerPath)
	if err != nil {
		return fmt.Errorf("installer not found: %w", err)
	}
	if installerInfo.Size() == 0 {
		return fmt.Errorf("installer is empty (0 bytes)")
	}

	log.Printf("installer verified: %d bytes", installerInfo.Size())
	log.Printf("waiting for PID %d to exit...", opts.pid)
	if err := waitForProcessExit(opts.pid, 30*time.Second); err != nil {
		return fmt.Errorf("failed waiting for main app to exit: %w", err)
	}
	log.Println("main app process has exited")

	installerArgs := []string{"/S"}
	if strings.TrimSpace(opts.installDir) != "" {
		installerArgs = append(installerArgs, "/D="+installDir)
	}

	log.Printf("launching installer: %s %s", opts.installerPath, strings.Join(installerArgs, " "))
	installerCmd := exec.Command(opts.installerPath, installerArgs...)
	installerCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	installerCmd.Stdout = nil
	installerCmd.Stderr = nil
	installerCmd.Stdin = nil

	if err := installerCmd.Start(); err != nil {
		return fmt.Errorf("failed to start installer: %w", err)
	}

	if err := installerCmd.Wait(); err != nil {
		return fmt.Errorf("installer exited unsuccessfully: %w", err)
	}
	log.Println("installer completed successfully")

	if info, err := os.Stat(executablePath); err != nil {
		return fmt.Errorf("installed executable missing at %s: %w", executablePath, err)
	} else if info.IsDir() {
		return fmt.Errorf("installed executable path is a directory: %s", executablePath)
	}

	log.Printf("relaunching installed app: %s", executablePath)
	relaunchCmd := exec.Command(executablePath)
	relaunchCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: 0x08000000}
	relaunchCmd.Stdout = nil
	relaunchCmd.Stderr = nil
	relaunchCmd.Stdin = nil

	if err := relaunchCmd.Start(); err != nil {
		log.Printf("failed to relaunch updated app: %v", err)
		return fmt.Errorf("failed to relaunch updated app: %w", err)
	}
	if err := relaunchCmd.Process.Release(); err != nil {
		log.Printf("warning: failed to release relaunched process handle: %v", err)
	}
	log.Printf("updated app relaunched with PID %d", relaunchCmd.Process.Pid)

	if err := os.Remove(opts.installerPath); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: failed to remove staged installer %s: %v", opts.installerPath, err)
	}
	stagingDir := filepath.Dir(opts.installerPath)
	if isManagedUpdateStagingDir(stagingDir) {
		if err := os.RemoveAll(stagingDir); err != nil {
			log.Printf("warning: failed to clean staging dir %s: %v", stagingDir, err)
		}
	}
	removeUpdaterStateFile(opts.stateFile)

	log.Println("windows installer handoff completed successfully")
	return nil
}
