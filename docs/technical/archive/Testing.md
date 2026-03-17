# Backend Testing Guide

## Overview

This document describes the testing approach, conventions, and instructions for running tests in the ControlZebra backend (Go services).

## Test Organization

Tests follow Go's standard conventions:
- Test files are named `*_test.go`
- Test files are located alongside the source files in `services/`
- Tests use Go's built-in `testing` package

```
services/
├── git_service.go
├── git_service_test.go          # Tests for GitService
├── settings_service.go
├── settings_service_test.go     # Tests for SettingsService
├── filesystem_service.go
├── filesystem_service_test.go   # Tests for FileSystemService
├── runner.go
├── runner_test.go               # Tests for CommandRunner
└── file_dialog_service.go       # No tests (requires Wails runtime)
```

## Running Tests

### Run All Tests
```bash
go test ./services/... -v
```

### Run Tests for a Specific Service
```bash
# GitService tests
go test ./services/... -run "Test.*Git" -v

# FileSystemService tests
go test ./services/... -run "Test.*Directory\|Test.*File\|Test.*Parent" -v

# CommandRunner tests
go test ./services/... -run "Test.*Run\|Test.*Command" -v

# SettingsService tests
go test ./services/... -run "Test.*Settings\|Test.*Profile" -v
```

### Run Tests with Coverage
```bash
go test ./services/... -cover
```

### Generate Coverage Report
```bash
go test ./services/... -coverprofile=coverage.out
go tool cover -html=coverage.out -o coverage.html
open coverage.html  # macOS
```

## Test Categories

### Unit Tests

Most tests are unit tests that verify individual functions work correctly in isolation.

**GitService Tests:**
- `TestDetectRepo_*` - Repository detection tests
- `TestStatus_*` - Git status parsing tests
- `TestCommitAll_*` - Commit operation tests
- `TestGetRecentCommits_*` - History retrieval tests
- `TestPull_*`, `TestPush_*` - Remote operation tests (with no remote configured)

**FileSystemService Tests:**
- `TestListDirectory_*` - Directory listing with various scenarios
- `TestOpenFile_*` - File opening validation
- `TestGetParentDirectory` - Path manipulation

**CommandRunner Tests:**
- `TestRun_*` - Command execution scenarios
- `TestRunGit_*` - Git command execution
- `TestRunWithContext_*` - Timeout handling

**SettingsService Tests:**
- `TestGetAppSettings_*` - Settings retrieval
- `TestSaveAndGetAppSettings` - Persistence
- `TestGetUserProfile_*` - Git config reading
- `TestSetUserProfile_*` - Git config writing

### Integration Tests

Tests that interact with the real git CLI are considered integration tests:
- Create temporary git repositories
- Execute actual git commands
- Verify git state changes

These tests require `git` to be installed on the system.

## Test Helpers

### createTestRepo / cleanupTestRepo

Helper functions for git-related tests that create temporary repositories:

```go
func createTestRepo(t *testing.T) string {
    t.Helper()
    // Creates temp dir, runs git init, configures user
    return tmpDir
}

func cleanupTestRepo(t *testing.T, path string) {
    t.Helper()
    os.RemoveAll(path)
}

// Usage
func TestSomething(t *testing.T) {
    repoPath := createTestRepo(t)
    defer cleanupTestRepo(t, repoPath)
    // ... test code
}
```

## Test Patterns

### Table-Driven Tests

Used for testing functions with multiple input/output scenarios:

```go
func TestGetParentDirectory(t *testing.T) {
    tests := []struct {
        input    string
        expected string
    }{
        {"/home/user/file.txt", "/home/user"},
        {"/", "/"},
        {"", ""},
    }

    svc := NewFileSystemService()
    for _, tt := range tests {
        result := svc.GetParentDirectory(tt.input)
        if result != tt.expected {
            t.Errorf("GetParentDirectory(%q) = %q, expected %q", 
                tt.input, result, tt.expected)
        }
    }
}
```

### Error Case Testing

Tests verify proper error handling:

```go
func TestListDirectory_NonExistentPath(t *testing.T) {
    svc := NewFileSystemService()
    result := svc.ListDirectory("/nonexistent/path")

    if result.Error == "" {
        t.Error("Expected error for non-existent path")
    }
}
```

## Skipping Tests

Tests that depend on external tools use `t.Skip()`:

```go
func TestRunGit_Version(t *testing.T) {
    runner := NewCommandRunner()
    result := runner.RunGit(".", "--version")

    if !result.Success {
        t.Skipf("Git not available: %s", result.Error)
    }
    // ... rest of test
}
```

## Current Test Coverage

| Service              | Tests | Coverage Focus                          |
|---------------------|-------|----------------------------------------|
| GitService          | 13    | Repo detection, status, commits, sync  |
| SettingsService     | 5     | Settings persistence, git config       |
| FileSystemService   | 12    | Directory listing, file operations     |
| CommandRunner       | 9     | Command execution, timeouts, git       |
| FileDialogService   | 0     | Requires Wails runtime (not testable)  |

**Total: 39 tests**

## Adding New Tests

1. Create test functions in the corresponding `*_test.go` file
2. Name tests as `TestFunctionName_Scenario`
3. Use `t.Helper()` in helper functions
4. Clean up temporary files/directories with `defer`
5. Test both success and error cases
6. Run `go test ./services/... -v` to verify

## Continuous Integration

Tests can be run in CI with:

```bash
# Basic test run
go test ./services/... -v

# With race detection
go test ./services/... -race

# With coverage threshold
go test ./services/... -cover -coverprofile=coverage.out
```

## Known Limitations

- `FileDialogService` cannot be unit tested (requires Wails runtime)
- Remote git operations (Push/Pull) are only tested with "no remote" error cases
- Tests create real temporary files and git repositories
