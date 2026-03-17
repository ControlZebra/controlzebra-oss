# Incident Response

> What to do when something breaks in production.

## Severity Levels

| Level | Description | Response Time | Example |
|---|---|---|---|
| **P0 — Critical** | App crashes or data loss | Immediate | Git operations corrupt repos, app won't launch |
| **P1 — High** | Major feature broken | Same day | Sync fails for all users, commits lost |
| **P2 — Medium** | Feature degraded | Next sprint | Diff viewer doesn't render, history is slow |
| **P3 — Low** | Minor annoyance | Backlog | UI glitch, tooltip typo |

## Incident Flow

### 1. Detect

- User reports via support channel
- Crash analytics (PostHog)
- Internal testing

### 2. Assess

Determine severity by asking:

- **Data risk?** Can user data (commits, repo state) be corrupted or lost?
- **Workaround?** Can the user achieve their goal another way?
- **Scope?** Does this affect all users or a specific configuration?

### 3. Investigate

1. **Check debug logs** — If the user has Debug Mode enabled, export logs from the [[Debug Logger]] (ring-buffer stored in memory, exportable to JSON)
2. **Reproduce locally** — Open a similar repo, replicate the workflow
3. **Check [[CommandRunner]] output** — Look at the exact CLI commands and their stderr/stdout
4. **Check recent commits** — Was this introduced by a recent change?

### 4. Fix

- Follow the hotfix process in [[Release Process#Hotfix Process]]
- For P0/P1: branch directly from `main`, minimal fix, fast review
- For P2/P3: normal [[Development Workflow]]

### 5. Deploy

- Build, sign, distribute via [[Release Process]]
- Update the auto-updater manifest so users get the fix automatically

### 6. Post-Mortem

For P0 and P1 incidents, write a brief post-mortem:

```markdown
## Incident: <title>
**Date:** YYYY-MM-DD
**Severity:** P0/P1
**Duration:** X hours

### What happened
<description>

### Root cause
<root cause>

### Fix applied
<what was changed>

### Prevention
<what we'll do to prevent recurrence>
```

Store post-mortems in `docs/audit/`.

## Common Issue Categories

### Git Operation Failures

- Check `services/git_service.go` for the specific method
- Look at [[CommandRunner]] timeout (default 30s) — operation may be timing out
- Check if the repo is in a stuck state (merge, cherry-pick, revert, AM, bisect)
- The app has [[RepositorySettingsService#Recovery Tools|recovery tools]] for stuck states

### File Watcher Issues

- [[FileWatcherService]] uses fsnotify with 300ms debounce
- Can fail with too many open watchers on large repos
- Fallback: 30-second polling from frontend

### CLI Tool Not Found

- [[CLI Resolver]] searches: bundled → PATH → common install paths → bare command
- On Windows, [[Other Services#LocalBinService|LocalBinService]] auto-downloads portable MinGit + gh + git-lfs
- Check if the user's PATH is configured correctly

### Auth / GitHub Issues

- `gh auth status` to check GitHub CLI auth state
- [[GitHubService]] uses device flow — token may have expired
- Supabase session stored in OS keychain ([[Other Services#AuthService|AuthService]])

### Auto-Updater Failures

- [[Auto-Updater]] uses a sidecar binary (`cz-updater`)
- Check network connectivity to release manifest URL
- Verify Ed25519 signature matches the embedded public key
- Sidecar logs are separate from app logs

---

**Related:** [[Release Process]] | [[Debug Logger]] | [[CommandRunner]] | [[Git Workflows]]
