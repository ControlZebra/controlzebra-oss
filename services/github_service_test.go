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

func TestMapGitHubChangeRequestDetailJSON(t *testing.T) {
	result := mapGitHubChangeRequestDetailJSON(readChangeRequestFixture(t, "request-detail.json"))
	if !result.Success {
		t.Fatalf("expected detail mapping success, got %#v", result)
	}
	if result.ChangeRequest.Number != 42 || result.TotalFiles != 3 {
		t.Fatalf("unexpected detail mapping: %#v", result)
	}
	if result.ChangeRequest.ReviewDecision != "" {
		t.Fatalf("expected unavailable review decision to remain empty, got %q", result.ChangeRequest.ReviewDecision)
	}
	if len(result.ChangeRequest.Reviewers) != 1 || result.ChangeRequest.Reviewers[0].Login != "reviewer" {
		t.Fatalf("unexpected reviewer mapping: %#v", result.ChangeRequest.Reviewers)
	}
}

func TestGitHubServiceLoadsChangeRequestDetailAndFiles(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)
	runGitCmd(t, repoPath, "remote", "add", "origin", "https://github.com/controlzebra/plant-project.git")

	tempDir := t.TempDir()
	fakeGh := filepath.Join(tempDir, "gh")
	script := `#!/bin/sh
case "$1" in
repo)
  printf '%s\n' '{"nameWithOwner":"controlzebra/plant-project","url":"https://github.com/controlzebra/plant-project","defaultBranchRef":{"name":"main"}}'
  ;;
pr)
  printf '%s\n' '{"number":42,"title":"Update mixer sequence","url":"https://github.com/controlzebra/plant-project/pull/42","state":"OPEN","author":{"login":"operator"},"headRefName":"work/mixer-interlock","headRefOid":"head-oid","baseRefName":"main","baseRefOid":"base-oid","mergeStateStatus":"CLEAN","changedFiles":2,"reviewRequests":[{"requestedReviewer":{"login":"reviewer"}}]}'
  ;;
api)
  printf '%s\n' '[[{"filename":"logic/Mixer.L5X","status":"modified","additions":12,"deletions":4},{"filename":"config/renamed.json","previous_filename":"config/original.json","status":"renamed","additions":1,"deletions":0}]]'
  ;;
*)
  exit 1
  ;;
esac
`
	if err := os.WriteFile(fakeGh, []byte(script), 0755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}

	resolveMu.Lock()
	resolvedGh = fakeGh
	resolveOnce = sync.Once{}
	resolveOnce.Do(func() {})
	resolveMu.Unlock()
	t.Cleanup(RefreshCLIPaths)

	service := NewGitHubService()
	detail := service.GetChangeRequest(repoPath, 42)
	if !detail.Success || detail.ChangeRequest.Reviewers[0].Login != "reviewer" || detail.TotalFiles != 2 {
		t.Fatalf("unexpected detail result: %#v", detail)
	}

	files := service.ListChangeRequestFiles(repoPath, 42)
	if !files.Success || files.IsTruncated || len(files.Files) != 2 {
		t.Fatalf("unexpected file result: %#v", files)
	}
	if files.Files[1].PreviousPath != "config/original.json" {
		t.Fatalf("expected renamed file metadata, got %#v", files.Files[1])
	}
}

func TestMapGitHubChangeRequestRepositoryJSON(t *testing.T) {
	result := mapGitHubChangeRequestRepositoryJSON(readChangeRequestFixture(t, "repository.json"))
	if !result.Success {
		t.Fatalf("expected repository mapping success, got %#v", result)
	}
	if result.Repository.NameWithOwner != "controlzebra/plant-project" || result.Repository.DefaultBranch != "main" {
		t.Fatalf("unexpected repository mapping: %#v", result.Repository)
	}
}

func TestMapGitHubChangeRequestListJSONOmitsExternalRequests(t *testing.T) {
	repository := GitHubChangeRequestRepository{NameWithOwner: "controlzebra/plant-project"}
	result := mapGitHubChangeRequestListJSON(readChangeRequestFixture(t, "open_requests.json"), repository)
	if !result.Success || len(result.ChangeRequests) != 1 || result.OmittedExternalCount != 1 {
		t.Fatalf("unexpected request list mapping: %#v", result)
	}
	request := result.ChangeRequests[0]
	if request.Number != 42 || request.Author.Login != "operator" || request.ReviewDecision != "APPROVED" {
		t.Fatalf("unexpected request mapping: %#v", request)
	}
}

func TestChangeRequestRemoteHost(t *testing.T) {
	tests := []struct {
		remoteURL  string
		wantHost   string
		wantGitHub bool
	}{
		{"git@github.com:controlzebra/plant-project.git", "github.com", true},
		{"https://github.com/controlzebra/plant-project.git", "github.com", true},
		{"ssh://git@github.enterprise.example/controlzebra/plant-project.git", "github.enterprise.example", true},
		{"https://github-mirror.example/controlzebra/plant-project.git", "github-mirror.example", false},
		{"https://gitlab.com/controlzebra/plant-project.git", "gitlab.com", false},
	}
	for _, test := range tests {
		host, isGitHub := changeRequestRemoteHost(test.remoteURL)
		if host != test.wantHost || isGitHub != test.wantGitHub {
			t.Errorf("changeRequestRemoteHost(%q) = (%q, %t), want (%q, %t)", test.remoteURL, host, isGitHub, test.wantHost, test.wantGitHub)
		}
	}
}

func TestGetChangeRequestRepositoryClassifiesUnresolvedRepository(t *testing.T) {
	repoPath := createTestRepo(t)
	defer cleanupTestRepo(t, repoPath)
	runGitCmd(t, repoPath, "remote", "add", "origin", "https://github.com/controlzebra/missing.git")

	tempDir := t.TempDir()
	fakeGh := filepath.Join(tempDir, "gh")
	script := "#!/bin/sh\necho \"GraphQL: Could not resolve to a Repository with the name 'controlzebra/missing'.\" >&2\nexit 1\n"
	if err := os.WriteFile(fakeGh, []byte(script), 0755); err != nil {
		t.Fatalf("write fake gh: %v", err)
	}

	resolveMu.Lock()
	resolvedGh = fakeGh
	resolveOnce = sync.Once{}
	resolveOnce.Do(func() {})
	resolveMu.Unlock()
	t.Cleanup(RefreshCLIPaths)

	result := NewGitHubService().GetChangeRequestRepository(repoPath)
	if result.Success || result.ErrorCode != GitHubChangeRequestErrorRepositoryUnresolved {
		t.Fatalf("expected repository_unresolved, got %#v", result)
	}
}

func TestMapGitHubChangeRequestError(t *testing.T) {
	tests := []struct {
		message string
		want    GitHubChangeRequestErrorCode
	}{
		{"not logged in to github.com", GitHubChangeRequestErrorAuthRequired},
		{"HTTP 401: Bad credentials", GitHubChangeRequestErrorAuthRequired},
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
