package services

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

type githubAuthAttempt struct {
	ctx    context.Context
	cancel context.CancelFunc
	ready  chan struct{}
	done   chan struct{}
	result GitHubDeviceFlowResult // Written once, before ready closes.
}

func (g *GitHubService) authLoginStart(codeTimeout time.Duration) GitHubDeviceFlowResult {
	g.authMu.Lock()
	attempt := g.authAttempt
	if attempt == nil {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		attempt = &githubAuthAttempt{ctx: ctx, cancel: cancel, ready: make(chan struct{}), done: make(chan struct{})}
		g.authAttempt = attempt
		go g.runDeviceFlow(attempt, codeTimeout)
	}
	g.authMu.Unlock()
	<-attempt.ready
	return attempt.result
}

func (g *GitHubService) cancelAuthAttempt(attempt *githubAuthAttempt) {
	if attempt == nil {
		return
	}
	g.authMu.Lock()
	if g.authAttempt == attempt {
		g.authAttempt = nil
		attempt.cancel()
	}
	g.authMu.Unlock()
	<-attempt.done
}

func (g *GitHubService) runDeviceFlow(attempt *githubAuthAttempt, codeTimeout time.Duration) {
	output := &githubDeviceFlowOutput{codes: make(chan string, 1)}
	finished := make(chan CommandResult, 1)
	go func() {
		// Override clipboard mode for this invocation only, leaving saved gh
		// settings intact. Parsing also accepts the supported clipboard message.
		result := g.runner.runWithStderr(attempt.ctx, output, GhPath(), "auth", "login", "--hostname", githubHost, "--git-protocol", "https", "--web", "--clipboard=false")
		output.flush()
		finished <- result
	}()

	timer := time.NewTimer(codeTimeout)
	defer timer.Stop()
	var result GitHubDeviceFlowResult
	var commandResult CommandResult
	var reaped bool
	outcome := "code_received"
	select {
	case code := <-output.codes:
		result = GitHubDeviceFlowResult{Success: true, UserCode: code, VerificationURL: "https://github.com/login/device"}
	case commandResult = <-finished:
		reaped = true
		select {
		case code := <-output.codes:
			result = GitHubDeviceFlowResult{Success: true, UserCode: code, VerificationURL: "https://github.com/login/device"}
		default:
			outcome = "process_exit"
			if commandResult.Success {
				outcome = "unrecognized_output"
			} else if commandResult.ExitCode == -1 {
				outcome = "start_failed"
			}
			if output.readFailed() {
				outcome = "read_error"
			}
		}
	case <-attempt.ctx.Done():
		outcome = "cancelled"
	case <-timer.C:
		outcome = "code_timeout"
		if output.readFailed() {
			outcome = "read_error"
		} else if output.hasCodePrompt() {
			outcome = "unrecognized_output"
		}
	}

	// Check ownership before publishing a code, including when cancellation
	// and code delivery become ready together.
	g.authMu.Lock()
	if g.authAttempt != attempt || attempt.ctx.Err() == context.Canceled {
		outcome = "cancelled"
	} else if attempt.ctx.Err() == context.DeadlineExceeded {
		outcome = "code_timeout"
	}
	if outcome != "code_received" {
		result = deviceFlowFailure(outcome)
		attempt.cancel()
	}
	g.authMu.Unlock()

	// Failed starts return only after the process has been reaped. Successful
	// starts publish the code immediately and keep draining stderr until exit.
	if !result.Success && !reaped {
		commandResult = <-finished
		reaped = true
	}
	if result.Success {
		attempt.result = result
		close(attempt.ready)
	}
	if !reaped {
		commandResult = <-finished
	}
	if result.Success && !commandResult.Success {
		outcome = "process_exit"
		if attempt.ctx.Err() == context.Canceled {
			outcome = "cancelled"
		} else if attempt.ctx.Err() == context.DeadlineExceeded {
			outcome = "auth_timeout"
		}
	}
	attempt.cancel()
	GetDebugLogger().Log(LogLevelInfo, LogCategoryCommand, "GitHubService.AuthLoginStart",
		"Device flow: "+outcome, LogDetails{
			ExitCode: commandResult.ExitCode,
			Stderr:   output.diagnostics(),
			Error:    sanitize(commandResult.Error),
		}, 0)
	g.authMu.Lock()
	if g.authAttempt == attempt {
		g.authAttempt = nil
	}
	g.authMu.Unlock()
	if !result.Success {
		// Diagnostics and cleanup finish before returning an error, so an
		// immediate retry starts a fresh process.
		attempt.result = result
		close(attempt.ready)
	}
	close(attempt.done)
}

func deviceFlowFailure(outcome string) GitHubDeviceFlowResult {
	switch outcome {
	case "cancelled":
		return GitHubDeviceFlowResult{Cancelled: true}
	case "code_timeout":
		return GitHubDeviceFlowResult{Error: "GitHub took too long to send a verification code. Check your internet connection and try connecting again."}
	case "start_failed":
		return GitHubDeviceFlowResult{Error: "GitHub sign-in could not start. Check that GitHub CLI is installed and try connecting again."}
	case "unrecognized_output", "read_error":
		return GitHubDeviceFlowResult{Error: "The GitHub verification code could not be read. Try connecting again. If this continues, update GitHub CLI."}
	default:
		return GitHubDeviceFlowResult{Error: "GitHub sign-in stopped before sending a verification code. Check your internet connection and try connecting again."}
	}
}

var (
	githubDeviceCodePattern = regexp.MustCompile(`(?i)code\s*(?::\s*|\(\s*)([A-Z0-9]{4}-[A-Z0-9]{4})\b`)
	githubCodeRedaction     = regexp.MustCompile(`(?i)\b[A-Z0-9]{4}-[A-Z0-9]{4}\b`)
	githubANSIPattern       = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)
)

// githubDeviceFlowOutput parses complete stderr lines while retaining only
// bounded, redacted diagnostics. Its writer is also drained after code delivery.
type githubDeviceFlowOutput struct {
	mu          sync.Mutex
	codes       chan string
	pending     string
	diagnostic  string
	codePrompt  bool
	readFailure bool
}

func (o *githubDeviceFlowOutput) Write(data []byte) (int, error) {
	o.mu.Lock()
	defer o.mu.Unlock()
	o.pending += string(data)
	for {
		line, rest, found := strings.Cut(o.pending, "\n")
		if !found {
			break
		}
		o.pending = rest
		if len(line) > 64*1024 {
			o.pending = ""
			o.readFailure = true
			return 0, fmt.Errorf("device-flow stderr line exceeded limit")
		}
		o.line(line)
	}
	if len(o.pending) > 64*1024 {
		o.pending = ""
		o.readFailure = true
		return 0, fmt.Errorf("device-flow stderr line exceeded limit")
	}
	return len(data), nil
}

func (o *githubDeviceFlowOutput) line(line string) {
	line = githubANSIPattern.ReplaceAllString(line, "")
	o.codePrompt = o.codePrompt || strings.Contains(strings.ToLower(line), "code")
	if match := githubDeviceCodePattern.FindStringSubmatch(line); len(match) == 2 {
		select {
		case o.codes <- strings.ToUpper(match[1]):
		default:
		}
	}
	line = githubCodeRedaction.ReplaceAllString(sanitize(line), "<REDACTED>")
	o.diagnostic += line + "\n"
	if len(o.diagnostic) > maxFieldLen {
		o.diagnostic = o.diagnostic[len(o.diagnostic)-maxFieldLen:]
	}
}

func (o *githubDeviceFlowOutput) flush() {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.pending != "" {
		o.line(o.pending)
		o.pending = ""
	}
}

func (o *githubDeviceFlowOutput) diagnostics() string {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.diagnostic
}

func (o *githubDeviceFlowOutput) hasCodePrompt() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.codePrompt
}

func (o *githubDeviceFlowOutput) readFailed() bool {
	o.mu.Lock()
	defer o.mu.Unlock()
	return o.readFailure
}
