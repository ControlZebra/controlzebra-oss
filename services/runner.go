package services

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"time"
)

// CommandResult holds the output and status of a command execution
type CommandResult struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exitCode"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

// CommandRunner executes shell commands with working directory support
type CommandRunner struct {
	Timeout time.Duration
}

// NewCommandRunner creates a new CommandRunner with default timeout
func NewCommandRunner() *CommandRunner {
	return &CommandRunner{
		Timeout: 30 * time.Second,
	}
}

// Run executes a command in the specified working directory
func (r *CommandRunner) Run(workDir string, name string, args ...string) CommandResult {
	ctx, cancel := context.WithTimeout(context.Background(), r.Timeout)
	defer cancel()

	return r.RunWithContext(ctx, workDir, name, args...)
}

// RunWithContext executes a command with a custom context
func (r *CommandRunner) RunWithContext(ctx context.Context, workDir string, name string, args ...string) CommandResult {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = workDir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	result := CommandResult{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: 0,
		Success:  true,
	}

	if err != nil {
		result.Success = false
		result.Error = err.Error()

		// Extract exit code if available
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else {
			result.ExitCode = -1
		}
	}

	return result
}

// RunGit is a convenience method for running git commands
func (r *CommandRunner) RunGit(repoPath string, args ...string) CommandResult {
	return r.Run(repoPath, "git", args...)
}

// MustRunGit runs a git command and returns an error if it fails
func (r *CommandRunner) MustRunGit(repoPath string, args ...string) (string, error) {
	result := r.RunGit(repoPath, args...)
	if !result.Success {
		errMsg := result.Stderr
		if errMsg == "" {
			errMsg = result.Error
		}
		return "", fmt.Errorf("git %v failed: %s", args, errMsg)
	}
	return result.Stdout, nil
}
