# Windows Terminal Flash Bug — Investigation & Action Plan

**Date:** 2026-02-19  
**Reporter:** Multiple users  
**Symptom:** Brief console/terminal window flashes on Windows during clone, push, and sync operations  
**Severity:** Medium-High (cosmetic but alarming for non-technical users)

---

## Executive Summary

Windows GUI applications that spawn console-based child processes (like `git.exe`, `gh.exe`) must set the `CREATE_NO_WINDOW` flag to prevent a black console window from flashing on screen. ControlZebra's `CommandRunner` does this correctly via `hideWindowAttr()`. However, the investigation reveals **two categories of problems**:

1. **Direct gaps**: Several services bypass `CommandRunner` and call `exec.Command` without `hideWindowAttr()`
2. **Grandchild process flashes**: Even when the direct child (git/gh) is hidden, it may spawn its own children (credential helpers, SSH, MSYS2 shell) that flash windows

---

## Root Cause Analysis

### How `hideWindowAttr()` Works

`sysproc_windows.go` sets both `HideWindow: true` and `CreationFlags: 0x08000000` (`CREATE_NO_WINDOW`) on every `exec.Cmd`. This correctly prevents the **direct child process** from creating a console window.

### The Grandchild Problem (Primary Cause)

When users clone or push via HTTPS with GitHub:

```
ControlZebra (GUI)
  └─ git.exe push (CREATE_NO_WINDOW ✅, no console)
       └─ gh.exe auth git-credential (credential helper, spawned BY git)
            └─ May allocate console → FLASH 💥
```

Git invokes the credential helper configured by `gh auth setup-git`:
```
credential.helper = !/path/to/gh.exe auth git-credential
```

**On Windows, whether the credential helper flashes depends on how Git for Windows creates it:**

- Git for Windows uses MSYS2's `start_command()` / `CreateProcess()` internally
- If the parent git.exe has no console (our `CREATE_NO_WINDOW`), child processes **normally inherit** the no-console state
- **However**, Git for Windows bundles an MSYS2 runtime (`msys-2.0.dll`) that has its own process/console management layer. MSYS2 may allocate a pseudo-console (ConPTY) or real console for certain child process patterns, especially when stdin/stdout pipes are involved (as they are for credential helpers)
- Additionally, the `cmd/git.exe` wrapper (the one typically in PATH) is a thin launcher that re-execs the real MinGW `git.exe` — this intermediate spawn can also introduce console allocation

**This is the most likely cause of the reported flashes during clone and push.**

### The `gh` → `git` Chain

For clone operations via `GitHubService.RepoClone()`:

```
ControlZebra (GUI)
  └─ gh.exe repo clone (CREATE_NO_WINDOW ✅)
       └─ git.exe clone (spawned BY gh, inherits no-console state)
            └─ gh.exe auth git-credential (spawned BY git for auth)
                 └─ May flash
```

The `gh` CLI is a Go binary. Go's `os/exec` on Windows does NOT set `CREATE_NO_WINDOW` by default on child processes. When `gh` spawns `git clone`, it uses default creation flags. Since `gh` itself has no console, the child `git` should inherit that state — but this depends on the Go runtime version and Windows version.

### SSH Operations

For SSH-based remotes:
```
git.exe push (no console)
  └─ ssh.exe (may flash if it needs interactive key verification)
```

OpenSSH for Windows may allocate a console for host key prompts or passphrase entry.

---

## Audit: All `exec.Command` Calls Without `hideWindowAttr()`

### ❌ MISSING — Will Flash on Windows

| File | Line | Command | Trigger | User Impact |
|------|------|---------|---------|-------------|
| `updater_service.go` | 174 | `cz-updater check` | Background update check | Flash on app launch / periodic check |
| `updater_service.go` | 234 | `cz-updater download` | User-initiated update | Flash during update download |
| `filesystem_service.go` | 342 | `cmd /c start <path>` | Open file externally | Flash when opening files |
| `filesystem_service.go` | 526 | `cmd /c start <url>` | Open URL in browser | Flash when opening links |
| `filesystem_service.go` | 579 | `cmd /c echo\|set /p=...\|clip` | Copy to clipboard | Flash when copying text |
| `filesystem_service.go` | 700 | `powershell.exe ... DeleteFile` | Move to Recycle Bin | Flash when deleting files |

### ✅ COVERED — Already Has `hideWindowAttr()`

| File | Line | Command | Notes |
|------|------|---------|-------|
| `runner.go` | 51 | `CommandRunner.RunWithContext` | All `RunGit`, `RunGh`, `Run` go through here |
| `runner.go` | 122 | `CommandRunner.RunGitRaw` | Binary output variant |
| `runner.go` | 216 | `CommandRunner.RunWithContextAndStdin` | Stdin variant |
| `progress_service.go` | 376 | `runGitWithProgress` | Push/pull/sync with streaming |
| `local_bin_service.go` | 259 | `git lfs install --skip-repo` | LFS initialization |
| `github_service.go` | 179 | `gh auth login` | Auth flow |
| `github_service.go` | 241 | `gh auth login --web` | Web auth flow |

### ⚪ INTENTIONAL — Expected to Show a Window

| File | Line | Command | Notes |
|------|------|---------|-------|
| `filesystem_service.go` | 429 | `cmd /c start cmd /k cd /d <dir>` | Intentionally opens a terminal |
| `filesystem_service.go` | 482 | `explorer /select,<path>` | Intentionally opens Explorer |

---

## Action Plan

### Phase 1: Direct Fixes (Low Risk, High Impact)

**Task 1.1: Add `hideWindowAttr()` to UpdaterService**

- File: `services/updater_service.go`
- Lines: 174 (`CheckForUpdate`) and 234 (`DownloadUpdate`)
- Fix: Add `cmd.SysProcAttr = hideWindowAttr()` after `exec.Command` / `exec.CommandContext`
- Also add `cmd.Env = buildCommandEnv(u.sidecarPath)` for consistency
- Impact: Eliminates flash during update checks (happens automatically on launch)

**Task 1.2: Add `hideWindowAttr()` to FileSystemService Windows calls**

- File: `services/filesystem_service.go`
- Lines: 342 (OpenFile), 526 (OpenURL), 579 (CopyToClipboard), 700 (MoveToTrash)
- Fix: Add `cmd.SysProcAttr = hideWindowAttr()` for each Windows `cmd.exe` / `powershell.exe` invocation
- Note: Skip lines 429 (OpenInTerminal) and 482 (RevealInFinder) — these intentionally show windows
- Impact: Eliminates flash when copying to clipboard, deleting files, opening files/URLs

### Phase 2: Credential Helper Window Flash (Medium Risk, High Impact)

This is the **primary cause** of user-reported flashes during clone/push.

**Task 2.1: Replace `gh` credential helper with token-based credential store**

Instead of relying on git spawning `gh.exe auth git-credential` at runtime (which creates a grandchild process we can't control), pre-populate credentials so git never needs to invoke an external helper:

After `gh auth login` succeeds:
1. Run `gh auth token --hostname github.com` (via our runner, with `CREATE_NO_WINDOW`) to extract the OAuth token
2. Store the token using `git credential approve` (via our runner):
   ```
   echo "protocol=https\nhost=github.com\nusername=x-access-token\npassword=TOKEN" | git credential approve
   ```
3. Configure `credential.helper` to use `manager` (Git Credential Manager) or `wincred` instead of `gh`
4. Git Credential Manager and wincred are GUI-aware and don't flash console windows

**Alternative Task 2.1b: Use `-c` flag to override credential helper inline**

For each git command that accesses remotes, prepend a credential config override:
```go
args := []string{
    "-c", fmt.Sprintf("credential.helper=!%s auth git-credential", ghPath),
    "push", "--progress",
}
```
This doesn't solve the flash itself, but gives us a single place to change the approach.

**Task 2.2: Consider using `git clone` directly instead of `gh repo clone`**

For the clone flow, replace:
```go
g.runner.Run(workDir, GhPath(), "repo", "clone", repo)
```

With a direct `git clone` call where we control auth via environment:
```go
// Get clone URL from gh first (no network auth needed for public repo metadata)
// Then clone with git directly, with full hideWindowAttr() control
g.runner.RunGit(workDir, "clone", "--progress", cloneURL)
```

This removes one level of process nesting (`gh` → `git`) and reduces flash opportunities.

### Phase 3: SSH Window Flash (Low Risk, Low Frequency)

**Task 3.1: Set `GIT_SSH_COMMAND` to suppress SSH console allocation**

In `buildCommandEnv()`, add:
```go
env = setEnvCaseInsensitive(env, "GIT_SSH_COMMAND", "ssh -o BatchMode=yes")
```

This tells SSH to never prompt interactively (which can cause console allocation). The tradeoff is that SSH operations requiring host key confirmation will fail — but for a GUI app targeting non-technical users, this is acceptable since ControlZebra primarily uses HTTPS (GitHub CLI auth configures HTTPS URLs).

### Phase 4: Add CloneWithProgress (Bonus — UX Improvement)

**Task 4.1: Create `CloneWithProgress` in ProgressService**

The current clone flow (`GitHubService.RepoClone`) blocks without progress streaming. Create a `CloneWithProgress` method in `ProgressService` that uses `runGitWithProgress` with `git clone --progress`. This:
- Provides progress feedback to users (large repos can take minutes)
- Ensures the clone goes through the `CREATE_NO_WINDOW` path
- Eliminates the `gh` → `git` child process chain entirely

---

## Implementation Priority

| Priority | Task | Effort | Impact |
|----------|------|--------|--------|
| P0 | 1.1 — UpdaterService `hideWindowAttr()` | 15 min | Fixes flash on every app launch |
| P0 | 1.2 — FileSystemService `hideWindowAttr()` | 30 min | Fixes flash on file ops |
| P1 | 2.1 — Token-based credential store | 2-3 hrs | Fixes flash during push/pull/sync (main complaint) |
| P1 | 4.1 — CloneWithProgress via direct git | 2-3 hrs | Fixes flash during clone + adds progress UX |
| P2 | 2.2 — Replace `gh repo clone` with `git clone` | 1-2 hrs | Reduces process nesting for clone |
| P3 | 3.1 — SSH BatchMode | 15 min | Prevents SSH prompts from flashing |

---

## Testing Strategy

1. **Manual Windows testing**: After each phase, test on Windows with:
   - Fresh clone of a private GitHub repo (exercises credential helper)
   - Push to a private repo (exercises credential helper)
   - Update check (exercises updater sidecar)
   - Copy to clipboard, delete file (exercises filesystem service)
   
2. **Screen recording**: Use Windows screen recorder at 60fps to catch sub-second flashes

3. **Process Monitor**: Use Sysinternals Process Monitor to trace all `CreateProcess` calls and verify `CREATE_NO_WINDOW` is set on every child process tree

4. **Regression guard**: Ensure all existing tests pass, especially:
   - `services/git_service_test.go`
   - `services/github_service_test.go`
   - `services/updater_service_test.go`

---

## Files to Modify

| File | Changes |
|------|---------|
| `services/updater_service.go` | Add `hideWindowAttr()` to `CheckForUpdate()` and `DownloadUpdate()` |
| `services/filesystem_service.go` | Add `hideWindowAttr()` to Windows `cmd.exe` and `powershell.exe` calls |
| `services/runner.go` | Potentially add SSH env vars to `buildCommandEnv()` |
| `services/progress_service.go` | Add `CloneWithProgress()` method |
| `services/git_service.go` | Update credential helper strategy in `ensureGitHubHTTPSCredentials()` |
| `services/github_service.go` | Optionally replace `gh repo clone` with direct `git clone` |
