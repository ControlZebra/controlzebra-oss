package services

import (
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

func readChangeRequestFixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", "change_requests", name))
	if err != nil {
		t.Fatalf("read fixture %s: %v", name, err)
	}
	return data
}

func TestMapGitHubAuthenticatedUserJSON(t *testing.T) {
	result := mapGitHubAuthenticatedUserJSON(readChangeRequestFixture(t, "authenticated_user.json"))
	if !result.Success {
		t.Fatalf("expected success, got %s", result.Error)
	}
	if result.User.Login != "controlzebra-user" || result.User.ID != "123456" || result.User.Name != "" {
		t.Fatalf("unexpected user mapping: %#v", result.User)
	}
}

func TestMapGitHubAuthenticatedUserJSONRejectsMalformedOrMissingLogin(t *testing.T) {
	for _, input := range [][]byte{[]byte("{"), []byte(`{"id": 1}`)} {
		result := mapGitHubAuthenticatedUserJSON(input)
		if result.Success || result.ErrorCode != GitHubChangeRequestErrorInternal {
			t.Fatalf("expected internal mapping error, got %#v", result)
		}
	}
}

func TestMapGitHubChangeRequestFilesJSON(t *testing.T) {
	result := mapGitHubChangeRequestFilesJSON(readChangeRequestFixture(t, "files-multipage.json"), 3)
	if !result.Success || !result.IsTruncated || result.ErrorCode != GitHubChangeRequestErrorFilesTruncated {
		t.Fatalf("expected truncated successful file result, got %#v", result)
	}
	if len(result.Files) != 2 || result.Files[1].PreviousPath != "config/original.json" {
		t.Fatalf("expected flattened renamed files, got %#v", result.Files)
	}
}

func TestMapGitHubChangeRequestError(t *testing.T) {
	tests := []struct {
		message string
		want    GitHubChangeRequestErrorCode
	}{
		{"not logged in to github.com", GitHubChangeRequestErrorAuthRequired},
		{"HTTP 403: Resource not accessible by integration", GitHubChangeRequestErrorPermissionDenied},
		{"API rate limit exceeded", GitHubChangeRequestErrorRateLimited},
		{"dial tcp: lookup api.github.com: no such host", GitHubChangeRequestErrorNetworkUnavailable},
		{"unexpected failure", GitHubChangeRequestErrorInternal},
	}
	for _, test := range tests {
		if got := mapGitHubChangeRequestError(CommandResult{Stderr: test.message}); got != test.want {
			t.Errorf("mapGitHubChangeRequestError(%q) = %q, want %q", test.message, got, test.want)
		}
	}
}

func TestGitHubServiceGetAuthenticatedUserUsesGHAPI(t *testing.T) {
	tempDir := t.TempDir()
	argsPath := filepath.Join(tempDir, "args")
	fakeGh := filepath.Join(tempDir, "gh")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > '" + argsPath + "'\nprintf '%s\\n' '{\"login\":\"fixture-user\",\"id\":42,\"type\":\"User\",\"name\":\"Fixture\"}'\n"
	if err := os.WriteFile(fakeGh, []byte(script), 0755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}

	resolveMu.Lock()
	resolvedGh = fakeGh
	resolveOnce = sync.Once{}
	resolveOnce.Do(func() {})
	resolveMu.Unlock()
	t.Cleanup(RefreshCLIPaths)

	result := NewGitHubService().GetAuthenticatedUser()
	if !result.Success || result.User.Login != "fixture-user" {
		t.Fatalf("expected fake gh user, got %#v", result)
	}
	args, err := os.ReadFile(argsPath)
	if err != nil {
		t.Fatalf("read fake gh arguments: %v", err)
	}
	if !strings.Contains(string(args), "api\n--hostname\ngithub.com\nuser") {
		t.Fatalf("GetAuthenticatedUser used unexpected gh arguments: %q", args)
	}
}

func TestGitHubService_IsGHInstalled(t *testing.T) {
	svc := NewGitHubService()
	installed := svc.IsGHInstalled()
	// This test just checks that the method runs without panic
	// The result depends on whether gh is installed on the system
	t.Logf("GitHub CLI installed: %v", installed)
}

func TestGitHubService_GetGHVersion(t *testing.T) {
	svc := NewGitHubService()
	version := svc.GetGHVersion()
	if svc.IsGHInstalled() && version == "" {
		t.Error("Expected version string when gh is installed")
	}
	t.Logf("GitHub CLI version: %s", version)
}

func TestGitHubService_AuthStatus(t *testing.T) {
	svc := NewGitHubService()
	if !svc.IsGHInstalled() {
		t.Skip("gh CLI not installed")
	}

	status := svc.AuthStatus()
	t.Logf("Auth status - LoggedIn: %v, Username: %s, Error: %s",
		status.LoggedIn, status.Username, status.Error)
}

func TestGitHubService_RepoList(t *testing.T) {
	svc := NewGitHubService()
	if !svc.IsGHInstalled() {
		t.Skip("gh CLI not installed")
	}

	status := svc.AuthStatus()
	if !status.LoggedIn {
		t.Skip("Not logged in to GitHub")
	}

	result := svc.RepoList(5, "")
	if !result.Success {
		t.Errorf("RepoList failed: %s", result.Error)
		return
	}

	t.Logf("Found %d repositories", len(result.Repos))
	for _, repo := range result.Repos {
		t.Logf("  - %s (private: %v)", repo.FullName, repo.Private)
	}
}

func TestGitHubService_RepoList_Visibility(t *testing.T) {
	svc := NewGitHubService()
	if !svc.IsGHInstalled() {
		t.Skip("gh CLI not installed")
	}

	status := svc.AuthStatus()
	if !status.LoggedIn {
		t.Skip("Not logged in to GitHub")
	}

	// Test public repos
	publicResult := svc.RepoList(5, "public")
	if publicResult.Success {
		t.Logf("Found %d public repositories", len(publicResult.Repos))
	}

	// Test private repos
	privateResult := svc.RepoList(5, "private")
	if privateResult.Success {
		t.Logf("Found %d private repositories", len(privateResult.Repos))
	}
}

func TestFormatInt(t *testing.T) {
	tests := []struct {
		input    int
		expected string
	}{
		{0, "0"},
		{1, "1"},
		{10, "10"},
		{100, "100"},
		{-1, "-1"},
		{30, "30"},
	}

	for _, test := range tests {
		result := formatInt(test.input)
		if result != test.expected {
			t.Errorf("formatInt(%d) = %s, expected %s", test.input, result, test.expected)
		}
	}
}

func TestGitHubService_AuthLogout(t *testing.T) {
	svc := NewGitHubService()
	if !svc.IsGHInstalled() {
		t.Skip("gh CLI not installed")
	}

	// Test logout - should succeed even if not logged in
	// (the fix handles the "not logged in" case gracefully)
	result := svc.AuthLogout()
	t.Logf("Logout result - Success: %v, Message: %s, Error: %s",
		result.Success, result.Message, result.Error)

	// Verify the result is successful (either logged out or already logged out)
	if !result.Success {
		t.Errorf("AuthLogout failed unexpectedly: %s", result.Error)
	}
}
