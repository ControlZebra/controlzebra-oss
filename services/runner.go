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
	cmd.SysProcAttr = hideWindowAttr()

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

// RunGit is a convenience method for running git commands.
// Uses the bundled git binary when available, otherwise falls back to PATH.
func (r *CommandRunner) RunGit(repoPath string, args ...string) CommandResult {
	return r.Run(repoPath, GitPath(), args...)
}

// RunGitRaw executes a git command and returns raw stdout bytes.
// Use for binary content (images, etc.) where string conversion corrupts data.
// Returns the raw bytes and any error encountered.
func (r *CommandRunner) RunGitRaw(repoPath string, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(context.Background(), r.Timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, GitPath(), args...)
	cmd.Dir = repoPath
	cmd.SysProcAttr = hideWindowAttr()

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		errMsg := stderr.String()
		if errMsg == "" {
			errMsg = err.Error()
		}
		return nil, fmt.Errorf("git %v failed: %s", args, errMsg)
	}

	return stdout.Bytes(), nil
}

// RunGh is a convenience method for running gh CLI commands.
// Uses the bundled gh binary when available, otherwise falls back to PATH.
func (r *CommandRunner) RunGh(workDir string, args ...string) CommandResult {
	return r.Run(workDir, GhPath(), args...)
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

// MustRunGh runs a gh CLI command and returns an error if it fails
func (r *CommandRunner) MustRunGh(workDir string, args ...string) (string, error) {
	result := r.RunGh(workDir, args...)
	if !result.Success {
		errMsg := result.Stderr
		if errMsg == "" {
			errMsg = result.Error
		}
		return "", fmt.Errorf("gh %v failed: %s", args, errMsg)
	}
	return result.Stdout, nil
}

// RunWithStdin executes a command with provided stdin input
func (r *CommandRunner) RunWithStdin(workDir string, stdinInput string, name string, args ...string) CommandResult {
	ctx, cancel := context.WithTimeout(context.Background(), r.Timeout)
	defer cancel()

	return r.RunWithContextAndStdin(ctx, workDir, stdinInput, name, args...)
}

// RunWithContextAndStdin executes a command with a custom context and stdin input
func (r *CommandRunner) RunWithContextAndStdin(ctx context.Context, workDir string, stdinInput string, name string, args ...string) CommandResult {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = workDir
	cmd.SysProcAttr = hideWindowAttr()

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	cmd.Stdin = bytes.NewBufferString(stdinInput)

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
