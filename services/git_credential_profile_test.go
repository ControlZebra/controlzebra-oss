package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// This uses the real resolved Git and gh binaries, including the managed
// Windows bundle. Only disposable configuration and a fixture token are used.
func TestGitCredentialProfileLookup(t *testing.T) {
	runner := NewCommandRunner()
	root := t.TempDir()
	global := filepath.Join(root, "gitconfig")
	config := "[credential \"https://github.com\"]\n\thelper =\n\thelper = !'missing-gh-for-issue-87' auth git-credential\n"
	if err := os.WriteFile(global, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	for key, value := range map[string]string{
		"GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_GLOBAL": global,
		"GIT_CONFIG_COUNT": "0", "GIT_CONFIG_PARAMETERS": "",
		"GIT_TERMINAL_PROMPT": "0", "GIT_ASKPASS": "", "SSH_ASKPASS": "",
		"GH_CONFIG_DIR": root, "GH_TOKEN": "ghp_issue87_fixture_not_a_real_token",
		"GITHUB_TOKEN": "", "GH_HOST": "github.com",
	} {
		t.Setenv(key, value)
	}
	logger := GetDebugLogger()
	logging := logger.IsEnabled()
	logger.SetEnabled(false)
	t.Cleanup(func() { logger.SetEnabled(logging) })
	input := "protocol=https\nhost=github.com\n\n"
	stale := runner.RunGitWithStdin(root, input, "credential", "fill")
	if stale.Success || !strings.Contains(stale.Stderr, "missing-gh-for-issue-87") {
		t.Fatal("isolated stale helper did not reproduce the missing-executable failure")
	}

	// Copy the real gh into a path that exercises spaces and shell apostrophes.
	ghBinary, err := os.ReadFile(GhPath())
	if err != nil {
		t.Skip("resolved GitHub CLI is not installed")
	}
	dir := filepath.Join(root, "tools with spaces and O'Brien")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	name := "gh"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	gh := filepath.Join(dir, name)
	if err := os.WriteFile(gh, ghBinary, 0700); err != nil {
		t.Fatal(err)
	}
	p := gitCredentialProfile{ghPath: gh, usable: true}
	active := *runner
	active.credentials = &p
	result := active.RunGitWithStdin(root, input, "credential", "fill")
	if !result.Success {
		t.Fatalf("resolved helper lookup failed (exit %d): %s", result.ExitCode, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "password="+os.Getenv("GH_TOKEN")+"\n") {
		t.Fatal("lookup did not return the fixture credential from the resolved gh")
	}
	after, err := os.ReadFile(global)
	if err != nil || !bytes.Equal(after, []byte(config)) {
		t.Fatal("lookup changed persistent credential configuration")
	}
	t.Log("stale helper reproduced; resolved gh lookup passed; configuration unchanged")

	t.Run("all execution modes", func(t *testing.T) {
		// The alias feeds Git's credential protocol to a nested real Git. It
		// also proves command-scoped configuration survives shell descendants.
		alias := "alias.fixture-credential=!f() { printf 'protocol=https\\nhost=github.com\\n\\n' | git credential fill; }; f"
		args := []string{"-c", alias, "fixture-credential"}
		buffered := active.RunGit(root, args...)
		if !buffered.Success || !strings.Contains(buffered.Stdout, "password="+os.Getenv("GH_TOKEN")) {
			t.Fatal("buffered execution did not use the scoped helper")
		}
		raw, err := active.RunGitRaw(root, args...)
		if err != nil || !bytes.Contains(raw, []byte("password="+os.Getenv("GH_TOKEN"))) {
			t.Fatal("raw execution did not use the scoped helper")
		}
		var stdout, stderr bytes.Buffer
		streamed := active.runWithWriters(context.Background(), root, &stdout, &stderr, GitPath(), args...)
		if !streamed.Success || !strings.Contains(stdout.String(), "password="+os.Getenv("GH_TOKEN")) {
			t.Fatal("streaming execution did not use the scoped helper")
		}
		progress := NewProgressService().runGitWithProgress(&active, root, "fixture", args)
		if !progress.Success || !strings.Contains(progress.Stdout, "password="+os.Getenv("GH_TOKEN")) {
			t.Fatal("progress execution did not use the scoped helper")
		}
		partial := NewProgressService().runGitWithProgress(&active, root, "fixture", []string{"-c", "alias.fixture-partial=!printf stdout; printf stderr >&2; exit 7", "fixture-partial"})
		if partial.Success || partial.ExitCode != 7 || partial.Stdout != "stdout" || partial.Stderr != "stderr" || partial.Error != "stderr" {
			t.Fatal("progress execution dropped partial output or exit status")
		}
		stderr.Reset()
		// runWithStderr has no working-directory parameter; -C preserves its
		// existing caller-owned parsing and discarded-stdout contract.
		if result := active.runWithStderr(context.Background(), &stderr, GitPath(), append([]string{"-C", root}, args...)...); !result.Success {
			t.Fatal("stderr execution did not use the scoped helper")
		}
	})

	t.Run("host scope and native fallback", func(t *testing.T) {
		fallback := "[credential]\n\thelper = " + strconv.Quote("!f() { printf 'username=native\\npassword=native-fixture\\n'; }; f") + "\n"
		included := filepath.Join(root, "included-config")
		if err := os.WriteFile(included, []byte(fallback), 0600); err != nil {
			t.Fatal(err)
		}
		competing := "[include]\n\tpath = included-config\n" +
			"[credential \"https://*.com\"]\n\thelper = " + strconv.Quote("!f() { printf 'username=wildcard\\npassword=wildcard-fixture\\n'; }; f") + "\n" +
			"[credential \"https://github.com/owner\"]\n\thelper =\n\thelper = " + strconv.Quote("!f() { printf 'username=path\\npassword=path-fixture\\n'; }; f") + "\n"
		if err := os.WriteFile(global, []byte(competing), 0600); err != nil {
			t.Fatal(err)
		}
		defer os.WriteFile(global, []byte(config), 0600)
		for _, tc := range []struct {
			name, protocol, host, path, password string
			usable                               bool
		}{
			{"GitHub overrides included wildcard and path helpers", "https", "github.com", "owner/repo", os.Getenv("GH_TOKEN"), true},
			{"unusable gh retains path helper", "https", "github.com", "owner/repo", "path-fixture", false},
			{"Gist retains native helper", "https", "gist.github.com", "", "native-fixture", true},
			{"other host retains native helper", "https", "example.org", "", "native-fixture", true},
			{"HTTP retains native helper", "http", "github.com", "", "native-fixture", true},
			{"SSH retains native helper", "ssh", "github.com", "", "native-fixture", true},
		} {
			t.Run(tc.name, func(t *testing.T) {
				profile := gitCredentialProfile{ghPath: gh, usable: tc.usable}
				operation := *runner
				operation.credentials = &profile
				input := "protocol=" + tc.protocol + "\nhost=" + tc.host + "\npath=" + tc.path + "\n\n"
				args := []string{"-c", "credential.useHttpPath=true", "credential", "fill"}
				result := operation.RunGitWithStdin(root, input, args...)
				if !result.Success || !strings.Contains(result.Stdout, "password="+tc.password+"\n") {
					t.Fatalf("wrong helper selected (exit %d): %s", result.ExitCode, result.Stderr)
				}
			})
		}
		embedded := active.RunGitWithStdin(root, "url=https://fixture:embedded-fixture@github.com/owner/repo\n\n", "credential", "fill")
		if !embedded.Success || !strings.Contains(embedded.Stdout, "password=embedded-fixture\n") {
			t.Fatal("temporary helper changed embedded credential precedence")
		}
		if after, err := os.ReadFile(global); err != nil || !bytes.Equal(after, []byte(competing)) {
			t.Fatal("lookup changed the included/competing credential configuration")
		}
	})

	t.Run("concurrent operations", func(t *testing.T) {
		var wg sync.WaitGroup
		for i := 0; i < 8; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				result := active.RunGitWithStdin(root, input, "credential", "fill")
				if !result.Success || !strings.Contains(result.Stdout, "password="+os.Getenv("GH_TOKEN")) {
					t.Error("concurrent helper lookup failed")
				}
			}()
		}
		wg.Wait()
	})

	t.Run("LFS descendant lookup", func(t *testing.T) {
		if !runner.RunGit(root, "lfs", "version").Success {
			t.Skip("Git LFS is not installed")
		}
		// A VM can take longer to start the pinned binaries; this fixture tests
		// credential propagation rather than the production timeout budget.
		lfsRunner := active
		lfsRunner.Timeout = 2 * time.Minute
		var authenticated, uploaded, sourceAPI atomic.Bool
		content := []byte("issue 87 disposable LFS content\n")
		oid := fmt.Sprintf("%x", sha256.Sum256(content))
		endpoint := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			_, password, ok := r.BasicAuth()
			if !ok || password != os.Getenv("GH_TOKEN") {
				w.Header().Set("WWW-Authenticate", `Basic realm="fixture"`)
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			authenticated.Store(true)
			t.Logf("LFS fixture: %s %s", r.Method, r.URL.Path)
			w.Header().Set("Content-Type", "application/vnd.git-lfs+json")
			switch {
			case strings.HasSuffix(r.URL.Path, "/objects/batch"):
				var request struct {
					Operation string `json:"operation"`
				}
				json.NewDecoder(r.Body).Decode(&request)
				href := "https://github.com/objects/" + oid
				if request.Operation == "upload" {
					href = "https://github.com/upload/" + oid
				}
				json.NewEncoder(w).Encode(map[string]any{"objects": []any{map[string]any{"oid": oid, "size": len(content), "actions": map[string]any{request.Operation: map[string]any{"href": href, "header": map[string]string{"Authorization": "Basic " + base64.StdEncoding.EncodeToString([]byte("fixture:"+os.Getenv("GH_TOKEN")))}}}}}})
			case r.Method == "GET" && strings.HasPrefix(r.URL.Path, "/objects/"):
				w.Write(content)
			case r.Method == "PUT" && strings.HasPrefix(r.URL.Path, "/upload/"):
				data, _ := io.ReadAll(r.Body)
				uploaded.Store(bytes.Equal(data, content))
			default:
				io.WriteString(w, `{"locks":[]}`)
			}
		}))
		defer endpoint.Close()
		// Route github.com only to a loopback fixture; no external traffic.
		proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Host == "api.github.com:443" {
				sourceAPI.Store(true)
			}
			if r.Method != "CONNECT" || r.Host != "github.com:443" {
				w.WriteHeader(http.StatusBadGateway)
				return
			}
			upstream, err := net.Dial("tcp", strings.TrimPrefix(endpoint.URL, "https://"))
			if err != nil {
				w.WriteHeader(http.StatusBadGateway)
				return
			}
			defer upstream.Close()
			client, buffered, err := w.(http.Hijacker).Hijack()
			if err != nil {
				return
			}
			defer client.Close()
			buffered.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
			buffered.Flush()
			go io.Copy(upstream, buffered)
			io.Copy(client, upstream)
		}))
		defer proxy.Close()
		t.Setenv("HTTPS_PROXY", proxy.URL)
		t.Setenv("https_proxy", proxy.URL)
		t.Setenv("NO_PROXY", "")
		t.Setenv("no_proxy", "")
		for _, args := range [][]string{
			{"init"}, {"remote", "add", "origin", "https://github.com/issue87-fixture.git"},
			{"config", "lfs.https://github.com/issue87-fixture.git/info/lfs.access", "basic"},
			{"config", "http.sslVerify", "false"}, {"config", "lfs.url", "https://github.com/issue87-fixture.git/info/lfs"},
			{"config", "filter.lfs.process", "git-lfs filter-process"},
			{"config", "filter.lfs.smudge", "git-lfs smudge -- %f"},
			{"config", "filter.lfs.clean", "git-lfs clean -- %f"},
			{"config", "filter.lfs.required", "true"},
			{"config", "lfs.locksverify", "false"},
		} {
			if result := runner.RunGit(root, args...); !result.Success {
				t.Fatalf("fixture setup failed: %s", result.Stderr)
			}
		}
		if err := os.WriteFile(filepath.Join(root, ".gitattributes"), []byte("fixture.bin filter=lfs diff=lfs merge=lfs -text\n"), 0600); err != nil {
			t.Fatal(err)
		}
		pointer := []byte(fmt.Sprintf("version https://git-lfs.github.com/spec/v1\noid sha256:%s\nsize %d\n", oid, len(content)))
		if err := os.WriteFile(filepath.Join(root, "fixture.bin"), pointer, 0600); err != nil {
			t.Fatal(err)
		}
		for _, args := range [][]string{{"add", ".gitattributes", "fixture.bin"}, {"-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "pointer"}} {
			if result := runner.RunGit(root, args...); !result.Success {
				t.Fatalf("pointer setup failed: %s", result.Stderr)
			}
		}
		repoConfig := filepath.Join(root, ".git", "config")
		beforeRepo, err := os.ReadFile(repoConfig)
		if err != nil {
			t.Fatal(err)
		}
		args := []string{"-c", "http.sslVerify=false", "-c", "lfs.url=https://github.com/issue87-fixture.git/info/lfs",
			"lfs", "locks", "--json"}
		result := lfsRunner.RunGit(root, args...)
		if !result.Success {
			t.Fatalf("LFS descendant lookup failed (exit %d): %s", result.ExitCode, result.Stderr)
		}
		if !authenticated.Load() {
			t.Fatal("LFS fixture did not receive credentials from the scoped gh helper")
		}
		for _, args := range [][]string{{"lfs", "fetch", "origin", "HEAD"}, {"lfs", "push", "--object-id", "origin", oid}} {
			if result := lfsRunner.RunGit(root, args...); !result.Success {
				t.Fatalf("explicit LFS transfer failed: %s", result.Stderr)
			}
		}
		if !uploaded.Load() {
			t.Fatal("LFS upload did not deliver fixture bytes")
		}
		if err := os.RemoveAll(filepath.Join(root, ".git", "lfs", "objects")); err != nil {
			t.Fatal(err)
		}
		if err := os.Remove(filepath.Join(root, "fixture.bin")); err != nil {
			t.Fatal(err)
		}
		if result := lfsRunner.RunGit(root, "checkout", "--", "fixture.bin"); !result.Success {
			t.Fatalf("implicit LFS checkout failed (exit %d): %s; %s", result.ExitCode, result.Error, result.Stderr)
		}
		if data, err := os.ReadFile(filepath.Join(root, "fixture.bin")); err != nil || !bytes.Equal(data, content) {
			t.Fatal("implicit LFS filter did not return fixture bytes")
		}
		// The source-only gh phase runs its actual local Git preflight. Its
		// API is blocked by the loopback proxy, so no repository can be created.
		source := runner.RunGh(root, "repo", "create", "issue87-fixture", "--source", root, "--private")
		if source.Success || !sourceAPI.Load() {
			t.Fatal("source-only gh did not complete local preflight before the blocked API")
		}
		if after, err := os.ReadFile(global); err != nil || !bytes.Equal(after, []byte(config)) {
			t.Fatal("LFS lookup changed persistent credential configuration")
		}
		if after, err := os.ReadFile(repoConfig); err != nil || !bytes.Equal(after, beforeRepo) {
			t.Fatal("LFS lookup changed repository configuration")
		}
		t.Log("Git -> LFS -> credential lookup -> resolved gh passed; configuration unchanged")
	})
}
