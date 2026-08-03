// Package services provides backend functionality for the ControlZebra application.
// This file contains the ProgressService which runs git operations with progress streaming.
package services

import (
	"bufio"
	"context"
	"io"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ProgressService handles git operations with progress reporting
type ProgressService struct {
	app    *application.App
	runner *CommandRunner
	mu     sync.Mutex
}

// NewProgressService creates a new ProgressService instance
func NewProgressService() *ProgressService {
	return &ProgressService{
		runner: NewCommandRunner(),
	}
}

// SetApp sets the Wails application reference for event emission
func (p *ProgressService) SetApp(app *application.App) {
	p.app = app
}

// ProgressUpdate represents a progress event sent to the frontend
type ProgressUpdate struct {
	OperationID string `json:"operationId"`
	Phase       string `json:"phase"`      // "starting", "enumerating", "counting", "compressing", "writing", "receiving", "resolving", "done", "error"
	Percent     int    `json:"percent"`    // 0-100, -1 for indeterminate
	Message     string `json:"message"`    // Human-readable status
	IsComplete  bool   `json:"isComplete"` // True when operation finished
	Success     bool   `json:"success"`    // True if completed successfully
	Error       string `json:"error"`      // Error message if failed
}

// Pre-compiled regex for parsing git progress
var (
	// Matches: "Receiving objects:  45% (123/456)"
	progressPercentRegex = regexp.MustCompile(`(\w[\w\s]+):\s*(\d+)%\s*\((\d+)/(\d+)\)`)
	// Matches: "Counting objects: 123, done."
	progressDoneRegex = regexp.MustCompile(`(\w[\w\s]+):\s*(\d+),?\s*done`)
	// Matches: "remote: Counting objects: 123"
	remoteProgressRegex = regexp.MustCompile(`remote:\s*(\w[\w\s]+):\s*(\d+)`)
)

// emitProgress sends a progress update to the frontend
func (p *ProgressService) emitProgress(update ProgressUpdate) {
	if p.app != nil {
		p.app.Event.Emit("git-progress", update)
	}
}

// parseGitProgress extracts progress info from a git stderr line
func parseGitProgress(line string) (phase string, percent int, message string) {
	line = strings.TrimSpace(line)
	if line == "" {
		return "", -1, ""
	}

	if matches := progressPercentRegex.FindStringSubmatch(line); matches != nil {
		phase = strings.TrimSpace(strings.ToLower(matches[1]))
		if pct, err := strconv.Atoi(matches[2]); err == nil {
			percent = pct
		}
		return phase, percent, line
	}

	if matches := progressDoneRegex.FindStringSubmatch(line); matches != nil {
		phase = strings.TrimSpace(strings.ToLower(matches[1]))
		return phase, 100, line
	}

	if matches := remoteProgressRegex.FindStringSubmatch(line); matches != nil {
		phase = "remote: " + strings.TrimSpace(strings.ToLower(matches[1]))
		return phase, -1, line
	}

	lineLower := strings.ToLower(line)
	switch {
	case strings.Contains(lineLower, "enumerating"):
		return "enumerating", -1, line
	case strings.Contains(lineLower, "counting"):
		return "counting", -1, line
	case strings.Contains(lineLower, "compressing"):
		return "compressing", -1, line
	case strings.Contains(lineLower, "writing"):
		return "writing", -1, line
	case strings.Contains(lineLower, "receiving"):
		return "receiving", -1, line
	case strings.Contains(lineLower, "resolving"):
		return "resolving", -1, line
	case strings.Contains(lineLower, "unpacking"):
		return "unpacking", -1, line
	case strings.Contains(lineLower, "updating"):
		return "updating", -1, line
	}

	return "", -1, line
}

// ensureGitHubHTTPSCredentials configures non-interactive GitHub HTTPS auth
// for progress-tracked operations.
func (p *ProgressService) ensureGitHubHTTPSCredentials(repoPath string) {
	remoteResult := p.runner.RunGit(repoPath, "remote", "get-url", "origin")
	if !isGitHubHTTPSRemoteURL(remoteResult.Stdout) {
		return
	}
	configureGitHubHTTPSCredentials(p.runner)
}

// SyncWithProgress performs git pull + push with progress updates
// For branches without an upstream, it skips pull and just pushes with --set-upstream
// prune: if true, adds --prune to remove stale remote-tracking branches
// tags: if true, adds --tags to fetch all tags
func (p *ProgressService) SyncWithProgress(repoPath, operationID string, prune bool, tags bool) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.hasAnyRemote(repoPath) {
		errMsg := "No remote repository configured. Publish to cloud first."
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: errMsg, IsComplete: true, Success: false, Error: errMsg})
		return failedOp(errMsg)
	}

	p.ensureGitHubHTTPSCredentials(repoPath)

	hasUpstream := p.checkHasUpstream(repoPath)
	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "starting", Percent: -1, Message: "Starting sync..."})

	if hasUpstream {
		pullArgs := []string{"pull", "--no-rebase", "--progress"}
		if prune {
			pullArgs = append(pullArgs, "--prune")
		}
		if tags {
			pullArgs = append(pullArgs, "--tags")
		}

		pullResult := p.runGitWithProgress(repoPath, operationID, pullArgs)
		if !pullResult.Success {
			errMsg := pullResult.Error
			p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: errMsg, IsComplete: true, Success: false, Error: errMsg})
			if strings.Contains(errMsg, "no tracking information") || strings.Contains(errMsg, "no upstream") {
				return failedOp("No remote branch configured. Please set up a remote first.")
			}
			if strings.Contains(errMsg, "CONFLICT") || strings.Contains(errMsg, "conflict") {
				return failedOp("Merge conflict detected. Please resolve conflicts manually.")
			}
			return failedOp("Failed to sync (pull): " + errMsg)
		}
	}

	pushMessage := "Pushing changes to remote..."
	if !hasUpstream {
		pushMessage = "Publishing branch to remote..."
	}
	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "pushing", Percent: -1, Message: pushMessage})

	var pushArgs []string
	if hasUpstream {
		pushArgs = []string{"push", "--progress"}
	} else {
		branchName := p.getCurrentBranch(repoPath)
		if branchName == "" {
			p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: "Cannot determine current branch", IsComplete: true, Success: false, Error: "Cannot determine current branch"})
			return failedOp("Cannot determine current branch")
		}
		remoteName, ok := p.getPreferredRemote(repoPath)
		if !ok {
			return failedOp("No remote repository configured. Publish to cloud first.")
		}
		pushArgs = []string{"push", "--set-upstream", remoteName, branchName, "--progress"}
	}

	pushResult := p.runGitWithProgress(repoPath, operationID, pushArgs)
	if !pushResult.Success {
		errMsg := pushResult.Error
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: errMsg, IsComplete: true, Success: false, Error: errMsg})
		if strings.Contains(errMsg, "does not appear to be a git repository") || strings.Contains(errMsg, "No configured push destination") {
			return failedOp("No remote repository configured. Publish to cloud first.")
		}
		if strings.Contains(errMsg, "no upstream") || strings.Contains(errMsg, "has no upstream") {
			return failedOp("No remote branch configured. Please set up a remote first.")
		}
		if strings.Contains(errMsg, "rejected") {
			return failedOp("Push rejected. Remote has changes. Please sync again.")
		}
		return failedOp("Failed to sync (push): " + errMsg)
	}

	successMessage := "Synced successfully"
	if !hasUpstream {
		successMessage = "Branch published successfully"
	}
	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "done", Percent: 100, Message: successMessage, IsComplete: true, Success: true})
	return successOp(successMessage)
}

// checkHasUpstream checks if the current branch has an upstream configured.
// It is robust to restricted single-branch fetch refspecs, where a published
// branch's `@{u}` does not resolve because no remote-tracking ref is mirrored.
// Treating such a branch as "no upstream" would make Sync skip the pull and then
// fail the push as rejected, trapping the user in a re-sync loop.
func (p *ProgressService) checkHasUpstream(repoPath string) bool {
	branch := p.getCurrentBranch(repoPath)
	if branch == "" {
		// Detached HEAD or unknown branch: fall back to native detection.
		return p.runner.RunGit(repoPath, "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}").Success
	}
	_, ok := resolveBranchUpstreamShort(p.runner, repoPath, branch)
	return ok
}

func (p *ProgressService) hasAnyRemote(repoPath string) bool {
	result := p.runner.RunGit(repoPath, "remote")
	if !result.Success {
		return false
	}
	return strings.TrimSpace(result.Stdout) != ""
}

// getPreferredRemote returns origin when available, otherwise the first configured remote.
func (p *ProgressService) getPreferredRemote(repoPath string) (string, bool) {
	result := p.runner.RunGit(repoPath, "remote")
	if !result.Success {
		return "", false
	}

	lines := strings.Split(strings.TrimSpace(result.Stdout), "\n")
	remotes := make([]string, 0, len(lines))
	for _, line := range lines {
		name := strings.TrimSpace(line)
		if name != "" {
			remotes = append(remotes, name)
		}
	}

	if len(remotes) == 0 {
		return "", false
	}
	for _, remote := range remotes {
		if remote == "origin" {
			return remote, true
		}
	}
	return remotes[0], true
}

// getCurrentBranch returns the current branch name
func (p *ProgressService) getCurrentBranch(repoPath string) string {
	result := p.runner.RunGit(repoPath, "branch", "--show-current")
	if result.Success {
		return strings.TrimSpace(result.Stdout)
	}
	return ""
}

// PullWithProgress performs git pull with progress updates
func (p *ProgressService) PullWithProgress(repoPath, operationID string) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.hasAnyRemote(repoPath) {
		errMsg := "No remote repository configured. Publish to cloud first."
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: errMsg, IsComplete: true, Success: false, Error: errMsg})
		return failedOp(errMsg)
	}

	p.ensureGitHubHTTPSCredentials(repoPath)
	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "starting", Percent: -1, Message: "Fetching from remote..."})

	// Using merge strategy (not rebase) for safer conflict resolution
	result := p.runGitWithProgress(repoPath, operationID, []string{"pull", "--no-rebase", "--progress"})
	if !result.Success {
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Message: result.Error, IsComplete: true, Success: false, Error: result.Error})
		return failedOp("Pull failed: " + result.Error)
	}

	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "done", Percent: 100, Message: "Pull complete", IsComplete: true, Success: true})
	return successOp("Pull complete")
}

// PushWithProgress performs git push with progress updates
func (p *ProgressService) PushWithProgress(repoPath, operationID string) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	if !p.hasAnyRemote(repoPath) {
		errMsg := "No remote repository configured. Publish to cloud first."
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Percent: 0, Message: errMsg, IsComplete: true, Success: false, Error: errMsg})
		return failedOp(errMsg)
	}

	p.ensureGitHubHTTPSCredentials(repoPath)
	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "starting", Percent: -1, Message: "Pushing to remote..."})

	result := p.runGitWithProgress(repoPath, operationID, []string{"push", "--progress"})
	if !result.Success {
		p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "error", Message: result.Error, IsComplete: true, Success: false, Error: result.Error})
		return failedOp("Push failed: " + result.Error)
	}

	p.emitProgress(ProgressUpdate{OperationID: operationID, Phase: "done", Percent: 100, Message: "Push complete", IsComplete: true, Success: true})
	return successOp("Push complete")
}

// runGitWithProgress executes a git command and streams progress events
func (p *ProgressService) runGitWithProgress(repoPath, operationID string, args []string) CommandResult {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	gitExec := GitPath()
	cmd := exec.CommandContext(ctx, gitExec, args...)
	cmd.Dir = repoPath
	cmd.SysProcAttr = hideWindowAttr()
	cmd.Env = buildCommandEnv(gitExec)

	// Git sends progress to stderr
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return CommandResult{Success: false, Error: err.Error()}
	}

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return CommandResult{Success: false, Error: err.Error()}
	}

	if err := cmd.Start(); err != nil {
		return CommandResult{Success: false, Error: err.Error()}
	}

	var stdoutBuf, stderrBuf strings.Builder
	var lastUpdate time.Time
	const debounceInterval = 100 * time.Millisecond

	// Read stderr for progress (git outputs progress to stderr)
	go func() {
		reader := bufio.NewReader(stderrPipe)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				if err != io.EOF {
					stderrBuf.WriteString(err.Error())
				}
				break
			}

			stderrBuf.WriteString(line)

			// Debounce progress updates
			now := time.Now()
			if now.Sub(lastUpdate) < debounceInterval {
				continue
			}
			lastUpdate = now

			phase, percent, message := parseGitProgress(line)
			if phase != "" || message != "" {
				p.emitProgress(ProgressUpdate{
					OperationID: operationID,
					Phase:       phase,
					Percent:     percent,
					Message:     strings.TrimSpace(message),
				})
			}
		}
	}()

	// Read stdout
	go func() {
		reader := bufio.NewReader(stdoutPipe)
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				break
			}
			stdoutBuf.WriteString(line)
		}
	}()

	// Wait for command to complete
	err = cmd.Wait()

	result := CommandResult{
		Stdout:   stdoutBuf.String(),
		Stderr:   stderrBuf.String(),
		ExitCode: 0,
		Success:  true,
	}

	if err != nil {
		result.Success = false
		result.Error = stderrBuf.String()
		if result.Error == "" {
			result.Error = err.Error()
		}
		if exitErr, ok := err.(*exec.ExitError); ok {
			result.ExitCode = exitErr.ExitCode()
		} else {
			result.ExitCode = -1
		}
	}

	return result
}
