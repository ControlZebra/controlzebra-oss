# Product Overview

## What is ControlZebra?

ControlZebra is a **simplified desktop Git client** designed for **non-technical users** in industrial automation. It replaces complex Git workflows with simple, plain-English operations that PLC engineers, HMI designers, and automation teams can use without Git expertise.

## Who Is It For?

| User Type | Pain Point | How CZ Helps |
|-----------|-----------|---------------|
| PLC Engineers | Version-controlling Rockwell L5X files, binary configs | Automatic LFS tracking, visual L5X diffs |
| HMI Designers | Collaborating on large image/config assets | Image diff, 3D model viewer, conflict resolution |
| Automation Teams | No Git experience, fear of command line | Plain-English labels, one-click operations |
| Engineering Managers | Need audit trail of changes | Commit history, visual git graph |

## Core Design Principles

1. **Simplicity over power** — We expose 20% of Git that covers 95% of use cases
2. **Plain English** — Every label, button, and error message avoids Git jargon (see [[User-Facing Terminology]])
3. **Safety first** — Destructive operations require confirmation; recovery is always possible
4. **Industrial-file aware** — Built-in viewers for L5X, STL, OBJ, STEP, PDF, images
5. **Works offline** — Full local Git operations; sync when connected

## Key Features

### v1 — Core Git Operations ✅
- Open existing repositories or create new ones
- Save changes (commit) with a message
- Sync with remote (pull + push)
- Push changes to remote

### v2 — Professional Workflows ✅
- Commit history with visual git graph
- File diffs (text, image, PDF, 3D models, L5X ladder logic)
- Branch creation, switching, and merging (squash by default)
- Undo last save (soft reset) and discard changes
- Stash management ("Saved Work")
- Protected branch warnings
- Conflict resolution (Keep Mine / Keep Theirs / Keep Both)
- Git LFS tracking with auto-detection
- GitHub device-flow authentication
- Auto-updater (sidecar-based)
- Debug logging and diagnostics

### v3 — Industrial File Diffing (Planned)
- Structured diff for proprietary binary formats
- Deep L5X diff (rung-level, tag-level changes)

### v4 — Collaboration (Planned)
- ControlZebra accounts and team management
- Shared project settings
- Activity feeds and notifications

See [[Roadmap]] for detailed milestone planning.

## Technical Stack Summary

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Wails v3 (Go ↔ WebView bridge) |
| Backend | Go 1.26 |
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v4 + Radix UI + shadcn-style |
| Git Operations | CLI-first (os/exec → git, gh, git-lfs) |
| Auth | Supabase + OS keychain |
| Analytics | PostHog |
| Auto-Update | Custom sidecar (cz-updater) |

See [[Architecture Overview]] for the full technical deep-dive.
