# Isolated Integration — Manual Windows Checks

Manual checks for [IntegrationSessionService](../backend/services/IntegrationSessionService.md).

Windows is verified manually. There is no Windows CI for this feature, so this
checklist is the only evidence that the isolated integration mechanics hold on
the primary target platform.

## Scope

These checks cover the Git mechanics proven automatically on macOS by
`services/integration_git_harness_test.go` and `services/integration_apply_test.go`,
plus the Windows-specific failure modes those tests cannot reproduce.

Run `go test ./services/... -run Integration -v` on the Windows machine first.
Everything below assumes that suite passes.

## How to record a run

Append a new row to [Run log](#run-log) for every execution. Record the Git
version, the Windows build, and one line per failed check. Do not delete
previous rows.

## Checks

### 1. Linked worktrees

- [ ] `go test ./services/... -run Integration -v` passes on Windows.
- [ ] A repository with a linked worktree reports the correct administrative
      paths from inside the linked worktree, not the main one.
- [ ] Creating and removing the isolated workspace leaves no stray directory
      under the repository and no stale entry in `git worktree list --porcelain`.

### 2. Long paths

- [ ] Prepare a result in a repository whose path is within 30 characters of the
      260-character limit, containing a file that pushes the full path beyond it.
- [ ] Confirm workspace creation either succeeds or fails with a clear message,
      and never leaves a partial workspace behind.
- [ ] Repeat with `core.longpaths=true` and record whether behavior differs.

### 3. Antivirus and file locks

- [ ] With real-time scanning enabled, prepare and apply a result on a
      repository containing at least one file above 50 MB.
- [ ] Open a file from the isolated workspace in another application, then
      remove the workspace. Confirm removal reports a recoverable failure rather
      than leaving an unlocked, half-removed workspace.
- [ ] Leave a stale `index.lock` in the destination checkout, attempt to apply,
      and confirm the destination does not move and the message explains what to
      do.

### 4. Interrupted application

- [ ] Kill the application process during the fast-forward step. On restart,
      confirm the destination is either fully at the prepared result or fully at
      the captured destination revision, and that the project files, staged
      state, and branch all agree.
- [ ] Repeat with the machine powered off mid-apply, if a test machine allows it.
- [ ] Confirm no local unsaved, staged, or untracked work was lost in any run.

### 5. Case sensitivity

- [ ] Confirm two repositories whose paths differ only in letter case are
      treated as one repository, so only one isolated review can be active.

## Run log

| Date | Windows build | Git version | Result | Notes |
| --- | --- | --- | --- | --- |
| _pending_ | | | | Phase 0 exit criteria require one recorded run before Phase 1 begins. |
