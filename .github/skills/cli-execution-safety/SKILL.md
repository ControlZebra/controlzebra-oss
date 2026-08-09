---
name: cli-execution-safety
description: Use when writing or reviewing any Go code that shells out to git, gh, or git-lfs.
---

# CLI execution safety

- All CLI calls go through `CommandRunner` (`services/runner.go`) — never raw `os/exec`.
- Resolve binaries via `cli_resolver.go`: `GitPath()`, `GhPath()`, `LfsPath()` — bundled → PATH → fallback, cached via `sync.Once`. Call `RefreshCLIPaths()` if tools change at runtime.
- Default timeout is 30s; use a longer context for clone/push/LFS-fetch style operations.
- Parse `git status --porcelain` only — never human-readable git output.
- Windows: processes must set `SysProcAttr` (see `sysproc_windows.go`) to hide console flashes; environment must be sanitized (`GIT_ASKPASS`, `SSH_ASKPASS`, `VSCODE_GIT_ASKPASS_*` stripped, `GIT_TERMINAL_PROMPT=0`).
- Degrade gracefully if `gh`/`git-lfs` aren't installed — check `IsGHInstalled()` / `IsLFSInstalled()` before calling dependent methods; never crash.