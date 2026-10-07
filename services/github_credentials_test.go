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
			name: "clean only github.com helpers and their resets",
			helpers: map[string][]string{
				"credential.helper": {"manager"},
				githubKey:           {"", staleWindowsHelper, "", staleWindowsHelper},
				gistKey:             {"", installedWindowsHelper},
				otherKey:            {"", installedWindowsHelper},
				"credential.https://github.com.example.com.helper": {"", installedWindowsHelper},
			},
			want: map[string][]string{
				"credential.helper": {"manager"},
				githubKey:           nil,
				gistKey:             {"", installedWindowsHelper},
				otherKey:            {"", installedWindowsHelper},
				"credential.https://github.com.example.com.helper": {"", installedWindowsHelper},
			},
		},
		{
			name: "shared helpers remain unchanged",
			helpers: map[string][]string{
				"credential.helper": {"", staleWindowsHelper, staleWindowsHelper, "cache", "cache"},
			},
			want: map[string][]string{"credential.helper": {"", staleWindowsHelper, staleWindowsHelper, "cache", "cache"}},
		},
		{
			name:    "host duplicates use literal matching",
			helpers: map[string][]string{githubKey: {"", staleWindowsHelper, staleWindowsHelper, "cache", "cache"}},
			want:    map[string][]string{githubKey: {"", "cache", "cache"}},
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
			name: "ignore other helpers disabled by the last reset",
			helpers: map[string][]string{
				"credential.helper": {"cache"},
				githubKey:           {"manager", "", "!gh auth git-credential"},
			},
			want: map[string][]string{
				"credential.helper": {"cache"},
				githubKey:           {"manager"},
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

func TestConfigureGitHubHTTPSCredentialsWithOnlyGhHelper(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	installFakeGh(t, `#!/bin/sh
case "$*" in
  '--version') exit 0 ;;
  'auth status --hostname github.com') exit 0 ;;
  'auth token --hostname github.com') printf '%s\n' fixture-token ;;
  'auth git-credential get') printf '%s\n' username=x-access-token password=fixture-token ;;
  'auth git-credential store'|'auth git-credential erase') cat >/dev/null ;;
  *) exit 1 ;;
esac
`)
	// The resolved path must remain a valid Git shell helper when the install
	// directory contains spaces or an apostrophe.
	quotedGh := filepath.Join(t.TempDir(), "engineer's gh")
	if err := os.Rename(GhPath(), quotedGh); err != nil {
		t.Fatal(err)
	}
	resolveMu.Lock()
	resolvedGh = quotedGh
	resolveMu.Unlock()
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, "!'"+strings.ReplaceAll(GhPath(), "'", "'\\''")+"' auth git-credential")
	before := runner.RunWithStdin("", "protocol=https\nhost=github.com\n\n", GitPath(), "credential", "fill")
	if !before.Success || !strings.Contains(before.Stdout, "password=fixture-token\n") {
		t.Fatal("the original sole helper must supply fixture credentials")
	}
	for attempt := 0; attempt < 2; attempt++ {
		if !configureGitHubHTTPSCredentials(runner) {
			t.Fatal("setup failed with authenticated fake gh")
		}
		result := runner.RunWithStdin("", "protocol=https\nhost=github.com\n\n", GitPath(), "credential", "fill")
		if !result.Success || !strings.Contains(result.Stdout, "password=fixture-token\n") {
			t.Fatalf("migration removed the only usable credential source: %s", result.Stderr)
		}
	}
}

func TestConfigureGitHubHTTPSCredentialsWithoutHelper(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	installFakeGh(t, `#!/bin/sh
case "$*" in
  '--version') exit 0 ;;
  'auth status --hostname github.com') exit 0 ;;
  'auth token --hostname github.com') printf '%s\n' fixture-token ;;
  'auth git-credential get') printf '%s\n' username=x-access-token password=fixture-token ;;
  'auth git-credential store'|'auth git-credential erase') cat >/dev/null ;;
  *) exit 1 ;;
esac
`)
	if !configureGitHubHTTPSCredentials(runner) {
		t.Fatal("setup failed with authenticated fake gh")
	}
	result := runner.RunWithStdin("", "protocol=https\nhost=github.com\n\n", GitPath(), "credential", "fill")
	if !result.Success || !strings.Contains(result.Stdout, "password=fixture-token\n") {
		t.Fatalf("setup reported success without a usable helper: %s", result.Stderr)
	}
}

func TestConfigureGitHubHTTPSCredentialsPreservesOtherHosts(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	for _, mode := range []string{"host-specific", "shared", "shared-after-scoped"} {
		t.Run(mode, func(t *testing.T) {
			runner := isolatedCredentialConfig(t)
			legacyGh := filepath.Join(t.TempDir(), "legacy-gh")
			if err := os.WriteFile(legacyGh, []byte(`#!/bin/sh
if [ "$3" = get ]; then
  while IFS= read -r line && [ -n "$line" ]; do
    case "$line" in host=*) host=${line#host=} ;; esac
  done
  printf '%s\n' username=legacy-user "password=fixture-$host"
else
  cat >/dev/null
fi
`), 0755); err != nil {
				t.Fatal(err)
			}
			legacyHelper := "!'" + legacyGh + "' auth git-credential"
			installFakeGh(t, `#!/bin/sh
case "$*" in
  '--version'|'auth status --hostname github.com') exit 0 ;;
  'auth token --hostname github.com') printf '%s\n' fixture-github ;;
  'auth git-credential get') printf '%s\n' username=x-access-token password=fixture-github ;;
  'auth git-credential store'|'auth git-credential erase') cat >/dev/null ;;
  *) exit 1 ;;
esac
`)
			unchanged := map[string][]string{}
			if mode != "host-specific" {
				unchanged["credential.helper"] = []string{legacyHelper}
			} else {
				for _, host := range []string{"gist.github.com", "git.example.com"} {
					unchanged["credential.https://"+host+".helper"] = []string{"", legacyHelper}
				}
			}
			if mode != "shared" {
				addCredentialHelper(t, runner, githubCredentialHelperKey, "")
				addCredentialHelper(t, runner, githubCredentialHelperKey, legacyHelper)
			}
			for key, helpers := range unchanged {
				for _, helper := range helpers {
					addCredentialHelper(t, runner, key, helper)
				}
			}
			for attempt := 0; attempt < 2; attempt++ {
				if !configureGitHubHTTPSCredentials(runner) {
					t.Fatal("credential migration failed")
				}
				for key, helpers := range unchanged {
					assertCredentialHelpers(t, runner, key, helpers)
				}
				for _, host := range []string{"github.com", "gist.github.com", "git.example.com"} {
					want := "fixture-" + host
					if host == githubHost {
						want = "fixture-github"
					}
					result := runner.RunWithStdin("", "protocol=https\nhost="+host+"\n\n", GitPath(), "credential", "fill")
					if !result.Success || !strings.Contains(result.Stdout, "password="+want+"\n") {
						t.Fatalf("credential lookup failed for %s: %s", host, result.Stderr)
					}
				}
			}
		})
	}
}

func TestConfigureGitHubHTTPSCredentialsKeepsHelperWhenReplacementUnavailable(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	installFakeGh(t, "#!/bin/sh\nexit 1\n")
	helpers := []string{"", "!gh auth git-credential"}
	for _, helper := range helpers {
		addCredentialHelper(t, runner, githubCredentialHelperKey, helper)
	}
	if configureGitHubHTTPSCredentials(runner) {
		t.Fatal("setup succeeded without an available replacement")
	}
	assertCredentialHelpers(t, runner, githubCredentialHelperKey, helpers)
}

func TestConfigureGitHubHTTPSCredentialsCleansUpBeforeAuthFailure(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake gh uses a POSIX shell")
	}
	runner := isolatedCredentialConfig(t)
	installFakeGh(t, "#!/bin/sh\n[ \"$1\" = --version ]\n")
	const key = "credential.https://github.com.helper"
	addCredentialHelper(t, runner, "credential.helper", "cache")
	addCredentialHelper(t, runner, key, "")
	addCredentialHelper(t, runner, key, "!gh auth git-credential")
	if configureGitHubHTTPSCredentials(runner) {
		t.Fatal("setup should report unavailable authentication")
	}
	assertCredentialHelpers(t, runner, key, []string{"!'" + GhPath() + "' auth git-credential"})
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
  '--version') exit 0 ;;
  'auth status --hostname github.com') exit 0 ;;
  'auth token --hostname github.com') printf '%s\n' 'fixture-token' ;;
  'auth git-credential store') cat >/dev/null ;;
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
	assertCredentialHelpers(t, runner, key, []string{"!'" + GhPath() + "' auth git-credential"})
	credential, err := os.ReadFile(credentialPath)
	if err != nil {
		t.Fatalf("credential approval did not reach the preserved store: %v", err)
	}
	want := "protocol=https\nhost=github.com\nusername=x-access-token\npassword=fixture-token\n"
	if string(credential) != want {
		t.Fatal("credential store did not receive the expected fixture credential")
	}
}

func TestPrepareWindowsCredentialHelperPreservesOtherHelpers(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("fake git uses a POSIX shell")
	}
	tests := []struct {
		name      string
		helpers   []string
		available bool
		want      []string
		wantOK    bool
		scoped    []string
	}{
		{"append scoped fallback", []string{"cache", "!custom-helper"}, true, []string{"wincred"}, true, nil},
		{"respect reset order", []string{"wincred", "", "!custom-helper"}, true, []string{"wincred"}, true, nil},
		{"supported helper already active", []string{"!custom-helper", "", "wincred"}, true, nil, true, nil},
		{"no fallback installed", []string{"!gh auth git-credential"}, false, []string{"", "!gh auth git-credential"}, false, []string{"", "!gh auth git-credential"}},
		{"host reset disables inherited helper", []string{"wincred"}, true, []string{"manager", "", "wincred"}, true, []string{"manager", "", "!gh auth git-credential"}},
		{"isolate shared gh helper", []string{"wincred", "!gh auth git-credential"}, true, []string{"", "wincred"}, true, nil},
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
			for _, value := range test.scoped {
				addCredentialHelper(t, runner, githubCredentialHelperKey, value)
			}
			for attempt := 0; attempt < 2; attempt++ {
				if _, ok := prepareGitHubCredentialHelper(runner, true); ok != test.wantOK {
					t.Errorf("replacement available = %v, want %v", ok, test.wantOK)
				}
				if test.wantOK {
					removeGhCredentialHelpers(runner)
				}
				assertCredentialHelpers(t, runner, "credential.helper", test.helpers)
				assertCredentialHelpers(t, runner, githubCredentialHelperKey, test.want)
			}
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
  '--version') exit 0 ;;
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
	assertCredentialHelpers(t, runner, key, []string{"!'" + GhPath() + "' auth git-credential"})
	calls, err := os.ReadFile(callsPath)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(calls), "setup-git") || !strings.Contains(string(calls), "auth status --hostname github.com") {
		t.Errorf("expected credential migration instead of shell helper setup, got calls: %s", calls)
	}
}
