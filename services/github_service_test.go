package services

import (
	"testing"
)

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
