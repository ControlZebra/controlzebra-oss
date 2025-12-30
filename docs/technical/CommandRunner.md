# CommandRunner Documentation

## Overview

`CommandRunner` is a utility service that executes shell commands with timeout support and structured output handling. It serves as the foundation for `GitService` and other services that need to run external commands.

## Architecture

```
CommandRunner
    ├── Run()           - Execute command with default timeout
    ├── RunWithContext() - Execute with custom context/timeout
    ├── RunGit()        - Convenience method for git commands
    └── MustRunGit()    - Git command that returns error on failure
```

## Configuration

- **Default Timeout:** 30 seconds
- **Timeout** can be customized by setting `runner.Timeout` after creation

## Methods

### NewCommandRunner() *CommandRunner

Creates a new CommandRunner with default 30-second timeout.

```go
runner := NewCommandRunner()
runner.Timeout = 60 * time.Second // Optional: customize timeout
```

### Run(workDir string, name string, args ...string) CommandResult

Executes a command in the specified working directory.

- **Input:**
  - `workDir`: Working directory for command execution
  - `name`: Command name (e.g., "git", "ls")
  - `args`: Variable arguments to pass to the command
- **Output:** `CommandResult` with stdout, stderr, exit code, and status

### RunWithContext(ctx context.Context, workDir string, name string, args ...string) CommandResult

Executes a command with a custom context (e.g., for custom timeouts or cancellation).

- **Input:** Same as `Run()` but with explicit context
- **Use Case:** Custom timeout, cancellation, or deadline requirements

### RunGit(repoPath string, args ...string) CommandResult

Convenience method specifically for running git commands.

- **Input:** Repository path and git subcommand with arguments
- **Equivalent to:** `Run(repoPath, "git", args...)`

### MustRunGit(repoPath string, args ...string) (string, error)

Runs a git command and returns an error if it fails.

- **Input:** Repository path and git arguments
- **Output:** stdout on success, or error with stderr message
- **Use Case:** When you need Go-style error handling instead of checking `Success`

## Data Model

### CommandResult
```go
type CommandResult struct {
    Stdout   string `json:"stdout"`          // Standard output
    Stderr   string `json:"stderr"`          // Standard error
    ExitCode int    `json:"exitCode"`        // Exit code (0 = success)
    Success  bool   `json:"success"`         // true if exit code is 0
    Error    string `json:"error,omitempty"` // Error message if failed
}
```

## Usage Examples

### Basic Command Execution
```go
runner := NewCommandRunner()

// Run a simple command
result := runner.Run("/tmp", "ls", "-la")
if result.Success {
    fmt.Println(result.Stdout)
} else {
    fmt.Printf("Failed: %s\n", result.Stderr)
}
```

### Git Operations
```go
runner := NewCommandRunner()

// Get git status
result := runner.RunGit("/path/to/repo", "status", "--porcelain")
if result.Success {
    lines := strings.Split(result.Stdout, "\n")
    fmt.Printf("Changed files: %d\n", len(lines))
}

// Using MustRunGit for error handling
output, err := runner.MustRunGit("/path/to/repo", "log", "-1", "--oneline")
if err != nil {
    log.Fatalf("Git error: %v", err)
}
fmt.Println("Latest commit:", output)
```

### Custom Timeout
```go
runner := NewCommandRunner()

// Create a context with 5-second timeout
ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
defer cancel()

// Run potentially slow command
result := runner.RunWithContext(ctx, "/", "find", ".", "-name", "*.go")
if !result.Success && ctx.Err() == context.DeadlineExceeded {
    fmt.Println("Command timed out")
}
```

## Implementation Notes

- Uses Go's `os/exec` package for command execution
- stdout and stderr are captured separately using `bytes.Buffer`
- Exit codes are extracted from `exec.ExitError` when available
- Returns -1 for exit code when error is not an `ExitError` (e.g., command not found)
- Context cancellation is properly handled via `exec.CommandContext`
