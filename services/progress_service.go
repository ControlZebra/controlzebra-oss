// Package services provides backend functionality for the Rewind Logic application.
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

	// Try to match percentage progress (e.g., "Receiving objects: 45% (123/456)")
	if matches := progressPercentRegex.FindStringSubmatch(line); matches != nil {
		phase = strings.TrimSpace(strings.ToLower(matches[1]))
		if pct, err := strconv.Atoi(matches[2]); err == nil {
			percent = pct
		}
		return phase, percent, line
	}

	// Try to match done messages
	if matches := progressDoneRegex.FindStringSubmatch(line); matches != nil {
		phase = strings.TrimSpace(strings.ToLower(matches[1]))
		return phase, 100, line
	}

	// Try to match remote progress
	if matches := remoteProgressRegex.FindStringSubmatch(line); matches != nil {
		phase = "remote: " + strings.TrimSpace(strings.ToLower(matches[1]))
		return phase, -1, line
	}

	// Detect common phases from keywords
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

// SyncWithProgress performs git pull --rebase + push with progress updates
func (p *ProgressService) SyncWithProgress(repoPath, operationID string) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	// Emit starting state
	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "starting",
		Percent:     -1,
		Message:     "Starting sync...",
	})

	// Run pull with progress
	pullResult := p.runGitWithProgress(repoPath, operationID, "pull", []string{"pull", "--rebase", "--progress"})
	if !pullResult.Success {
		errMsg := pullResult.Error
		p.emitProgress(ProgressUpdate{
			OperationID: operationID,
			Phase:       "error",
			Percent:     0,
			Message:     errMsg,
			IsComplete:  true,
			Success:     false,
			Error:       errMsg,
		})

		// Check for common errors
		if strings.Contains(errMsg, "no tracking information") || strings.Contains(errMsg, "no upstream") {
			return failedOp("No remote branch configured. Please set up a remote first.")
		}
		if strings.Contains(errMsg, "CONFLICT") || strings.Contains(errMsg, "conflict") {
			return failedOp("Merge conflict detected. Please resolve conflicts manually.")
		}
		return failedOp("Failed to sync (pull): " + errMsg)
	}

	// Emit push starting
	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "pushing",
		Percent:     -1,
		Message:     "Pushing changes to remote...",
	})

	// Run push with progress
	pushResult := p.runGitWithProgress(repoPath, operationID, "push", []string{"push", "--progress"})
	if !pushResult.Success {
		errMsg := pushResult.Error
		p.emitProgress(ProgressUpdate{
			OperationID: operationID,
			Phase:       "error",
			Percent:     0,
			Message:     errMsg,
			IsComplete:  true,
			Success:     false,
			Error:       errMsg,
		})

		if strings.Contains(errMsg, "no upstream") || strings.Contains(errMsg, "has no upstream") {
			return failedOp("No remote branch configured. Please set up a remote first.")
		}
		if strings.Contains(errMsg, "rejected") {
			return failedOp("Push rejected. Remote has changes. Please sync again.")
		}
		return failedOp("Failed to sync (push): " + errMsg)
	}

	// Emit completion
	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "done",
		Percent:     100,
		Message:     "Synced successfully",
		IsComplete:  true,
		Success:     true,
	})

	return successOp("Synced successfully")
}

// PullWithProgress performs git pull with progress updates
func (p *ProgressService) PullWithProgress(repoPath, operationID string) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "starting",
		Percent:     -1,
		Message:     "Fetching from remote...",
	})

	result := p.runGitWithProgress(repoPath, operationID, "pull", []string{"pull", "--rebase", "--progress"})
	if !result.Success {
		p.emitProgress(ProgressUpdate{
			OperationID: operationID,
			Phase:       "error",
			Message:     result.Error,
			IsComplete:  true,
			Success:     false,
			Error:       result.Error,
		})
		return failedOp("Pull failed: " + result.Error)
	}

	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "done",
		Percent:     100,
		Message:     "Pull complete",
		IsComplete:  true,
		Success:     true,
	})

	return successOp("Pull complete")
}

// PushWithProgress performs git push with progress updates
func (p *ProgressService) PushWithProgress(repoPath, operationID string) OperationResult {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "starting",
		Percent:     -1,
		Message:     "Pushing to remote...",
	})

	result := p.runGitWithProgress(repoPath, operationID, "push", []string{"push", "--progress"})
	if !result.Success {
		p.emitProgress(ProgressUpdate{
			OperationID: operationID,
			Phase:       "error",
			Message:     result.Error,
			IsComplete:  true,
			Success:     false,
			Error:       result.Error,
		})
		return failedOp("Push failed: " + result.Error)
	}

	p.emitProgress(ProgressUpdate{
		OperationID: operationID,
		Phase:       "done",
		Percent:     100,
		Message:     "Push complete",
		IsComplete:  true,
		Success:     true,
	})

	return successOp("Push complete")
}

// runGitWithProgress executes a git command and streams progress events
func (p *ProgressService) runGitWithProgress(repoPath, operationID, opName string, args []string) CommandResult {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = repoPath

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
