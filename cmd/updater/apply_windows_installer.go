package main

import (
	"flag"
	"fmt"
	"strconv"
)

type windowsInstallerApplyOptions struct {
	installerPath string
	pid           int
	installDir    string
	logPath       string
	stateFile     string
}

func runApplyWindowsInstaller(args []string) error {
	fs := flag.NewFlagSet("apply-windows-installer", flag.ContinueOnError)

	var (
		installerPath string
		pidStr        string
		installDir    string
		logPath       string
		stateFile     string
	)

	fs.StringVar(&installerPath, "installer", "", "Path to the downloaded Windows installer (required)")
	fs.StringVar(&pidStr, "pid", "", "PID of the main app process to wait for (required)")
	fs.StringVar(&installDir, "install-dir", "", "Expected install directory (optional; default is LocalAppData Programs path)")
	fs.StringVar(&logPath, "log", "", "Path to log file (default: <temp>/cz-updater.log)")
	fs.StringVar(&stateFile, "state-file", "", "Path to the updater state file to clear after a successful apply")

	if err := fs.Parse(args); err != nil {
		return err
	}
	if installerPath == "" {
		return fmt.Errorf("--installer is required")
	}
	if pidStr == "" {
		return fmt.Errorf("--pid is required")
	}

	pid, err := strconv.Atoi(pidStr)
	if err != nil {
		return fmt.Errorf("invalid PID %q: %w", pidStr, err)
	}

	return runApplyWindowsInstallerPlatform(windowsInstallerApplyOptions{
		installerPath: installerPath,
		pid:           pid,
		installDir:    installDir,
		logPath:       logPath,
		stateFile:     stateFile,
	})
}
