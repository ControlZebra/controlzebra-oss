package services

import (
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
)

// Use real Git against a disposable global config. Never read or change the
// developer's credential configuration or contact GitHub in these tests.
func isolatedCredentialConfig(t *testing.T) *CommandRunner {
	t.Helper()
	t.Setenv("GIT_CONFIG_GLOBAL", filepath.Join(t.TempDir(), "gitconfig"))
	t.Setenv("GIT_CONFIG_NOSYSTEM", "1")
	t.Setenv("GIT_TERMINAL_PROMPT", "0")
	t.Chdir(t.TempDir())
	runner := NewCommandRunner()
	if !runner.Run("", GitPath(), "--version").Success {
		t.Skip("Git is unavailable")
	}
	return runner
}

func addCredentialHelper(t *testing.T, runner *CommandRunner, key, value string) {
	t.Helper()
	if result := runner.Run("", GitPath(), "config", "--global", "--add", key, value); !result.Success {
		t.Fatalf("add helper %s: %s", key, result.Stderr)
	}
}

func assertCredentialHelpers(t *testing.T, runner *CommandRunner, key string, want []string) {
	t.Helper()
	result := runner.Run("", GitPath(), "config", "--global", "--null", "--get-all", key)
	var got []string
	if result.Success {
		got = strings.Split(strings.TrimSuffix(result.Stdout, "\x00"), "\x00")
	} else if result.ExitCode != 1 {
		t.Fatalf("read helpers %s: %s", key, result.Stderr)
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("%s helpers = %q, want %q", key, got, want)
	}
}

func TestRemoveGhCredentialHelpers(t *testing.T) {
	const staleWindowsHelper = `!'C:\Users\Test Engineer\AppData\Local\ControlZebra\tools\bin\gh.exe' auth git-credential`
	const installedWindowsHelper = `!'C:/Users/Test Engineer/AppData/Local/ControlZebra/tools/bin/gh/bin/gh.exe' auth git-credential`
	const githubKey = "credential.https://github.com.helper"
	const gistKey = "credential.https://gist.github.com.helper"
	const otherKey = "credential.https://git.example.com.helper"
	tests := []struct {
		name    string
		helpers map[string][]string
		want    map[string][]string
	}{
		{
			name: "host-specific helpers and their resets",
			helpers: map[string][]string{
				"credential.helper": {"manager"},
				githubKey:           {"", staleWindowsHelper, "", staleWindowsHelper},
				gistKey:             {"", installedWindowsHelper},
				otherKey:            {"", "store --file=/tmp/other-credentials"},
			},
			want: map[string][]string{
				"credential.helper": {"manager"},
				githubKey:           nil,
				gistKey:             nil,
				otherKey:            {"", "store --file=/tmp/other-credentials"},
			},
		},
		{
			name: "generic duplicates use literal matching",
			helpers: map[string][]string{
				"credential.helper": {"", staleWindowsHelper, staleWindowsHelper, "cache", "cache"},
			},
			want: map[string][]string{"credential.helper": {"", "cache", "cache"}},
		},
		{
			name: "preserve other helpers and reset order at the same host",
			helpers: map[string][]string{
				githubKey: {"", "!gh auth git-credential", "", "!custom-helper\n--option", " "},
				gistKey:   {""},
			},
			want: map[string][]string{
				githubKey: {"", "", "!custom-helper\n--option", " "},
				gistKey:   {""},
			},
		},
		{
			name: "no gh helpers leaves configuration unchanged",
			helpers: map[string][]string{
				"credential.helper": {"", "manager-core"},
				githubKey:           {"", "wincred"},
			},
			want: map[string][]string{
				"credential.helper": {"", "manager-core"},
				githubKey:           {"", "wincred"},
			},
		},
		{name: "empty configuration"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runner := isolatedCredentialConfig(t)
			for key, values := range test.helpers {
				for _, value := range values {
					addCredentialHelper(t, runner, key, value)
				}
			}
			for attempt := 0; attempt < 2; attempt++ {
				removeGhCredentialHelpers(runner)
				for key, want := range test.want {
					assertCredentialHelpers(t, runner, key, want)
				}
			}
		})
	}
}

func TestConfigureGitHubHTTPSCredentialsCleansUpBeforeAuthFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	installFakeGh(t, "#!/bin/sh\nexit 1\n")
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, "credential.helper", "cache")
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, "!gh auth git-credential")
	if configureGitHubHTTPSCredentials(runner) {
		t.Fatal("setup should report unavailable authentication")
	}
	assertCredentialHelpers(t, runner, key, nil)
	assertCredentialHelpers(t, runner, "credential.helper", []string{"cache"})
}

func TestGitHubCredentialLookupAfterHelperMigration(t *testing.T) {
	runner := isolatedCredentialConfig(t)
	// Only fixture credentials are emitted; no network or credential store is used.
	addCredentialHelper(t, runner, "credential.helper", `!f() { printf '%s\n' 'username=fixture-user' 'password=fixture-password'; }; f`)
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, `!'/nonexistent/controlzebra/gh.exe' auth git-credential`)
	removeGhCredentialHelpers(runner)
	result := runner.RunWithStdin("", "protocol=https\nhost=github.com\n\n", GitPath(), "credential", "fill")
	if !result.Success || strings.Contains(result.Stderr, "No such file or directory") {
		t.Fatalf("credential lookup still invokes the missing gh helper: %s", result.Stderr)
	}
	if !strings.Contains(result.Stdout, "username=fixture-user\n") || !strings.Contains(result.Stdout, "password=fixture-password\n") {
		t.Fatal("credential lookup did not reach the preserved helper")
	}
}

func TestConfigureGitHubHTTPSCredentialsStoresTokenAfterMigration(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	credentialPath := filepath.Join(t.TempDir(), "fixture-credential")
	t.Setenv("CZ_TEST_CREDENTIAL_PATH", credentialPath)
	installFakeGh(t, `#!/bin/sh
case "$*" in
  'auth status --hostname github.com') exit 0 ;;
  'auth token --hostname github.com') printf '%s\n' 'fixture-token' ;;
  *) exit 1 ;;
esac
`)
	addCredentialHelper(t, runner, "credential.helper", `!f() { if [ "$1" = store ]; then cat > "$CZ_TEST_CREDENTIAL_PATH"; fi; }; f`)
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, "!gh auth git-credential")
	if !configureGitHubHTTPSCredentials(runner) {
		t.Fatal("credential-store setup failed with authenticated fake gh")
	}
	assertCredentialHelpers(t, runner, key, nil)
	credential, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("credential approval did not reach the preserved store: %v", err)
	}
	want := "protocol=https\nhost=github.com\nusername=x-access-token\npassword=fixture-token\n"
	if string(credential) != want {
		t.Fatal("credential store did not receive the expected fixture credential")
	}
}

func TestEnsureWindowsCredentialHelperPreservesOtherHelpers(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake git uses a POSIX shell")
	}
	tests := []struct {
		name      string
		helpers   []string
		available bool
		want      []string
	}{
		{"append fallback", []string{"cache", "!custom-helper"}, true, []string{"cache", "!custom-helper", "wincred"}},
		{"respect reset order", []string{"wincred", "", "!custom-helper"}, true, []string{"wincred", "", "!custom-helper", "wincred"}},
		{"supported helper already active", []string{"!custom-helper", "", "wincred"}, true, []string{"!custom-helper", "", "wincred"}},
		{"no fallback installed", []string{"!custom-helper"}, false, []string{"!custom-helper"}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			runner := isolatedCredentialConfig(t)
			realGit := GitPath()
			toolsDir := t.TempDir()
			if test.available {
				if err := os.WriteFile(filepath.Join(toolsDir, "git-credential-wincred.exe"), nil, 0755); err != nil {
					t.Fatal(err)
				}
			}
			t.Setenv("CZ_TEST_REAL_GIT", realGit)
			t.Setenv("CZ_TEST_GIT_EXEC_PATH", toolsDir)
			fakeGit := filepath.Join(toolsDir, "git")
			script := `#!/bin/sh
if [ "$1" = '--exec-path' ]; then
  printf '%s\n' "$CZ_TEST_GIT_EXEC_PATH"
else
  exec "$CZ_TEST_REAL_GIT" "$@"
fi
`
			if err := os.WriteFile(fakeGit, []byte(script), 0755); err != nil {
				t.Fatal(err)
			}
			resolveMu.Lock()
			resolvedGit = fakeGit
			resolveOnce = sync.Once{}
			resolveOnce.Do(func() {})
			resolveMu.Unlock()
			t.Cleanup(RefreshCLIPaths)
			for _, value := range test.helpers {
				addCredentialHelper(t, runner, "credential.helper", value)
			}
			ensureWindowsCredentialHelper(runner)
			assertCredentialHelpers(t, runner, "credential.helper", test.want)
		})
	}
}

func TestGitHubCredentialFailureRequestsReconnect(t *testing.T) {
	result := CommandResult{Stderr: "gh.exe: No such file or directory\nfatal: could not read Username for 'https://github.com': terminal prompts disabled"}
	const want = "GitHub authentication failed. Connect GitHub in ControlZebra and retry."
	if got := getErrorMessage(result); got != want {
		t.Errorf("Git recovery message = %q, want %q", got, want)
	}
	if got := getGHErrorMessage(result); got != want {
		t.Errorf("GitHub recovery message = %q, want %q", got, want)
	}
}

func TestRepoCreateFromLocalUsesCredentialMigration(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	callsPath := filepath.Join(t.TempDir(), "gh-calls")
	t.Setenv("CZ_TEST_GH_CALLS", callsPath)
	installFakeGh(t, `#!/bin/sh
printf '%s\n' "$*" >> "$CZ_TEST_GH_CALLS"
case "$*" in
  'auth status --hostname github.com') exit 1 ;;
  'repo create '*) exit 0 ;;
  *) exit 1 ;;
esac
`)
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, "!gh auth git-credential")
	result := NewGitHubService().RepoCreateFromLocal(t.TempDir(), "test-project", "", true, "")
	if !result.Success {
		t.Fatalf("create with fake gh: %s", result.Error)
	}
	assertCredentialHelpers(t, runner, key, nil)
	calls, err := os.ReadFile(callsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(calls), "setup-git") || !strings.Contains(string(calls), "auth status --hostname github.com") {
		t.Errorf("expected credential migration instead of shell helper setup, got calls: %s", calls)
	}
}
