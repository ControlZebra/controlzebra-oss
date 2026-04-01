# Python Automation MVP Plan

> Add repo-scoped Python automation to ControlZebra Desktop using managed runtimes, isolated dependencies, and app-driven triggers without turning the product into a general plugin platform.

## Background

ControlZebra already simplifies Git workflows for non-technical industrial users, but many teams also need small automations around those workflows. Common examples include generating reports after a save, checking exported files after a sync, transforming industrial assets after a branch switch, or notifying downstream systems when a repository changes.

The product currently has no scripting or automation layer, but it does already have several architectural seams we should reuse:

- `services/runner.go` provides a shared process execution model with timeouts and debug logging.
- `services/repository_settings_service.go` already manages repo-scoped configuration and background task state.
- `services/local_bin_service.go`, `services/local_bin_paths.go`, and `services/cli_resolver.go` already manage portable external tooling, especially for Windows.
- `services/data_paths.go` already defines stable per-user storage for tools, cache, and logs.
- Existing backend and frontend event seams already cover commit, sync, branch, background task, and repository lifecycle flows.

This means the MVP should extend the existing product architecture rather than inventing a separate plugin subsystem.

## Problem Statement

Users need safe, understandable automation that runs from ControlZebra workflow events, but the product must stay reliable for non-technical users.

- Requiring users to install and manage Python manually adds setup friction and support burden.
- Allowing arbitrary command strings or raw shell hooks creates injection, quoting, and debugging problems.
- Reusing one global Python environment for every automation creates dependency conflicts.
- Raw file-system events are noisy and can trigger repeated runs during normal editor save behavior.
- Blocking core Git actions on custom scripts would make the product feel fragile.

The MVP must support useful user-authored automation while keeping the default Git workflow stable and understandable.

## Goals

- Support user-created Python scripts that run from app-based triggers.
- Allow users to install custom Python libraries per automation.
- Keep the setup approachable for non-technical users by managing the Python runtime inside the app.
- Isolate dependencies so one automation does not break another.
- Make script failures visible without breaking Save Changes, Sync, or other core app actions.
- Reuse existing repo settings, portable toolchain, and event patterns where possible.

## Non-Goals

- Do not build a general plugin marketplace or extension SDK in phase 1.
- Do not support arbitrary shell, PowerShell, Bash, or Node automation in MVP.
- Do not add before-action or blocking hooks in MVP.
- Do not expose raw per-file watcher callbacks directly to user scripts.
- Do not add a full package manager UI in phase 1.
- Do not add secret storage, signing, or trust policy in phase 1.
- Do not add global cross-repository automations in phase 1.

## MVP Decisions

The recommended MVP is intentionally narrow:

- Managed Python runtime, especially for the Windows-first product target.
- Repo-scoped automations only.
- One automation folder per script.
- One isolated virtual environment per automation.
- Dependency installation from `requirements.txt`.
- Non-blocking execution only.
- Post-action and lifecycle triggers only.
- File-system support as one debounced repository-changed trigger, not raw watcher fan-out.

These constraints keep the feature useful without making ordinary Git workflows hostage to custom scripting.

## Proposed User Model

Each repository gets an automation folder inside `.controlzebra`:

```text
.controlzebra/
  config.json
  local.json
  automation/
    export-report/
      automation.json
      main.py
      requirements.txt
    validate-controller/
      automation.json
      validate.py
```

Recommended manifest shape for MVP:

```json
{
  "id": "export-report",
  "name": "Export Report",
  "enabled": true,
  "entry": "main.py",
  "triggers": ["after_save", "after_sync", "repo_changed"],
  "timeoutSeconds": 60,
  "cooldownSeconds": 10
}
```

Why JSON instead of YAML for MVP:

- It matches the app's existing `.controlzebra` config patterns.
- It reduces parser and templating complexity.
- It keeps the first implementation easy to validate and document.

YAML can be revisited later if users need more expressive configuration.

## Runtime And Dependency Model

### Managed Runtime

The app should manage its own Python runtime for MVP.

Rationale:

- ControlZebra targets non-technical users who should not need to find or install Python themselves.
- The app already has a portable toolchain pattern for Windows in `LocalBinService`.
- Managed runtime behavior is easier to support consistently than arbitrary system Python installations.

Recommended behavior:

- Install or extract Python into the existing app-local tools directory.
- Reuse the same portable download and progress event pattern used for Git, `gh`, and Git LFS.
- Keep future room for hybrid resolution later, but optimize the MVP around app-managed Python.

### Custom Libraries

Users should declare dependencies through `requirements.txt` inside each automation folder.

Recommended behavior:

- Create one virtual environment per automation in app-local storage outside the repo.
- Hash the `requirements.txt` file contents.
- Rebuild or refresh the venv only when the requirements hash or Python runtime version changes.
- Keep package installation out of the main settings form; the UI should validate and trigger installation, not act as a full package editor.

This model is safer than a shared global environment because:

- It isolates dependency conflicts.
- It keeps uninstall and rebuild logic simple.
- It is easier to reason about during support and debugging.

## Trigger Model

### Included Triggers

The MVP should support these trigger categories:

- `after_save`
- `after_sync`
- `after_push`
- `after_pull`
- `after_branch_switch`
- `repo_opened`
- `repo_closed`
- `repo_changed`

### Trigger Semantics

- All triggers are non-blocking.
- The main Git or repository action completes first.
- The automation is queued and runs asynchronously.
- Failures are surfaced in the UI and logs, but do not fail the parent action.

### File-System Trigger Guardrail

`repo_changed` is the only file-system-style trigger that should ship in MVP.

It should be:

- Debounced
- Cooldown-based per automation
- Backed by a changed-path summary, not a separate callback for every file event

This avoids repeated runs during editor save storms, generated file bursts, or watcher/polling overlap.

## Execution Contract

The automation service should execute Python scripts directly rather than interpolating command strings.

Recommended contract:

1. Resolve the managed Python runtime.
2. Ensure the automation's virtual environment exists.
3. Install dependencies if required.
4. Create a structured trigger payload.
5. Invoke the automation with the venv Python executable.
6. Capture stdout, stderr, exit code, duration, and timestamp.
7. Persist last-run metadata and emit an event for the frontend.

Trigger payload should be passed as JSON, either through stdin or a temporary file, and should include only safe context such as:

- repo path
- repo id
- branch name when available
- trigger name
- timestamp
- changed file hints for `repo_changed`
- app version

Avoid command templating in MVP. Structured payloads are easier to validate and much harder to misuse.

## Storage Model

### Inside Repository

Inside the repository, store only user-authored automation assets:

- manifest
- entry script
- optional `requirements.txt`

### Outside Repository

In app-local storage, keep runtime artifacts and mutable execution state:

- managed Python runtime
- one venv per automation
- dependency install markers
- recent run history
- optional temp payload files

This keeps the repo portable while avoiding accidental commits of virtual environments or cache data.

## Backend Architecture

### Reuse Existing Seams

The implementation should reuse these existing patterns:

- `services/runner.go` for process execution and timeout handling.
- `services/local_bin_service.go` for Python runtime download or preparation.
- `services/local_bin_paths.go` and `services/cli_resolver.go` for Python path resolution.
- `services/data_paths.go` for stable storage of runtime artifacts and venvs.
- `services/repository_settings_service.go` for repo-scoped configuration and status persistence.

### New Service

Add a dedicated backend service, for example `AutomationService`, responsible for:

- discovering automation folders in the active repo
- validating manifests
- resolving Python runtime and venv paths
- installing dependencies
- executing scripts
- storing run results
- emitting progress and completion events

This service should not replace `CommandRunner`; it should sit on top of it.

## Trigger Wiring

Prefer backend completion seams over frontend click handlers whenever possible.

Recommended wiring points:

- `services/git_service.go` for Save Changes and branch operations
- `services/progress_service.go` for Sync, Push, and Pull completion
- `services/repository_settings_service.go` for background-task completion
- `frontend/src/domain/repo/context/RepoContext.tsx` only for repository lifecycle hooks where backend completion seams are not already available

This keeps trigger dispatch closer to the actual source of truth and reduces race conditions.

## Frontend MVP

Add an Automation section to repository settings.

The UI should show:

- Python runtime status
- install or repair runtime action
- discovered automations
- enabled or disabled state
- configured triggers
- timeout and cooldown values
- dependency install status
- last run time
- last result
- recent stderr or stdout snippet

The UI should remain restrained and admin-like, consistent with the existing repo settings area. It should not try to become a code editor.

Recommended MVP flow:

1. User creates an automation folder under `.controlzebra/automation`.
2. User adds `automation.json`, `main.py`, and optional `requirements.txt`.
3. ControlZebra detects and validates the automation.
4. User can install dependencies or repair the environment from the repo settings UI.
5. Trigger activity and run history appear in the same area.

## Security And Safety Guardrails

MVP should include these guardrails from day one:

- Python-only execution, no generic shell commands.
- Structured trigger payloads, not string interpolation.
- App-owned working directory rules.
- Sanitized environment variables, including Python-specific cleanup.
- Per-automation timeouts.
- Single active run per automation id.
- Bounded execution history.
- Clear UI messaging that automations are user-authored code with repository access.

Known deferred items:

- signing and trust metadata
- secrets management
- organization-wide policy controls
- allowlist or denylist for packages

## Implementation Phases

## Phase 1: Manifest, Discovery, And Runtime Foundation

Deliverables:

- automation folder convention under `.controlzebra/automation`
- manifest schema and validation
- Python runtime path resolution
- Windows-first managed Python bootstrap
- Python environment sanitization rules

## Phase 2: Isolated Dependency Installation

Deliverables:

- one venv per automation
- `requirements.txt` hash tracking
- dependency install and rebuild flow
- persisted install status and errors

## Phase 3: Execution Service And Result Persistence

Deliverables:

- automation execution service
- async run queueing
- timeout handling
- last-run metadata
- event emission for frontend status updates

## Phase 4: Trigger Wiring

Deliverables:

- post-save trigger
- post-sync, post-push, and post-pull triggers
- branch switch trigger
- repo open and close triggers
- debounced `repo_changed` trigger

## Phase 5: Repository Settings UI

Deliverables:

- Automation settings category
- runtime status and repair UI
- automation discovery and validation UI
- dependency status and install actions
- recent run state and error surfacing

## Validation Plan

The MVP is complete only when the following are verified:

1. A new automation folder is discovered and validated correctly.
2. The managed Python runtime installs or resolves successfully on the supported platform path.
3. A venv is created for an automation and dependencies install from `requirements.txt`.
4. Save Changes triggers a script without blocking the commit flow.
5. Sync triggers a script without blocking the sync flow.
6. A failed script surfaces a clear error while the parent action still succeeds.
7. Repeated file saves do not cause repeated `repo_changed` storms beyond the configured cooldown.
8. Python runtime upgrades trigger safe venv refresh behavior.

Validation should include backend unit tests, backend integration tests with temp repositories, and manual verification on the Windows packaging path.

## Risks And Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| File-system triggers run too often | High | Ship only a debounced `repo_changed` trigger with cooldown and changed-path summary |
| Dependency conflicts between automations | High | Use one venv per automation |
| Script failures confuse users | Medium | Persist last-run status and show recent stderr in repo settings |
| Runtime setup becomes too technical | High | Manage Python inside the app and reuse portable toolchain UX |
| Command injection or quoting bugs | High | Execute Python directly with structured payloads, not shell command templates |
| Main Git actions become fragile | High | Keep all MVP triggers non-blocking |

## Open Questions

- Should macOS use the same managed runtime in phase 1, or defer to a later parity pass if packaging gets heavy?
- Should `repo_changed` include a capped changed-file list, or only a count and summary in the first cut?
- Should the app offer a manual "Run automation now" action in MVP for debugging and setup verification?

## Recommended First Cut

Start with the smallest version that still proves the product value:

1. Managed Python runtime.
2. One venv per automation.
3. `requirements.txt` support.
4. `after_save`, `after_sync`, and `repo_changed` triggers.
5. Non-blocking execution with visible last-run state.
6. Minimal repo settings UI for validation and repair.

This first cut is enough to prove the workflow, support custom libraries, and test the runtime and trigger model without overcommitting to a broad automation platform.