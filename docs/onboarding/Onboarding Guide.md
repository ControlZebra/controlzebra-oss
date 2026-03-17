# Onboarding Guide

> Welcome to ControlZebra! This guide is your starting point as a new team member.

## What is ControlZebra?

ControlZebra is a **desktop Git client** designed for non-technical users in industrial automation — PLC engineers, HMI designers, and teams working with binary configs, ladder logic, and hardware schematics.

Read [[Product Overview]] for full context on the product, users, and goals.

## Key Concepts to Understand

Before diving into code, internalize these principles:

1. **User-first simplicity.** Our users don't know Git. Every feature must be self-explanatory. See [[User-Facing Terminology]] for how we map Git to plain English.
2. **CLI-first backend.** All git operations shell out to `git`, `gh`, and `git-lfs` via [[CommandRunner]]. We do NOT use Go git libraries.
3. **Wails v3 bridge.** Go methods with exported names auto-generate TypeScript bindings. The frontend calls Go functions as if they were local. See [[Architecture Overview]].
4. **Industrial file focus.** We support diffing for images, PDFs, 3D models (STL/STEP), and PLC ladder logic (L5X). See [[Viewer System]].

## Your First Week

### Day 1: Environment & Build

1. Follow [[Development Setup]] to get the app running locally
2. Run `task dev` and explore the UI
3. Open a test Git repository in the app

### Day 2: Architecture

Read these docs in order:

1. [[Architecture Overview]] — How Go + React + Wails fit together
2. [[Backend Architecture]] — Service registration, CLI execution
3. [[Frontend Architecture]] — React contexts, layout system, component patterns
4. [[Event System]] — How backend and frontend communicate

### Day 3: Core Services

1. [[Services Index]] — Skim all 13 services
2. [[GitService]] — The largest service (115+ methods). Read the method categories
3. [[RepositorySettingsService]] — Per-repo config and background tasks
4. [[CommandRunner]] — How every CLI command is executed

### Day 4: Frontend Deep Dive

1. [[Layout System]] — VS Code-like shell architecture
2. [[Context Providers]] — RepoContext (the git state machine), LayoutContext, AuthContext
3. [[Explorer Feature]] — The main user-facing feature
4. [[UI Components]] — shadcn-style Radix primitives

### Day 5: Workflows & Guides

1. [[Git Workflows]] — Decision trees for every git operation
2. [[Adding a New Service]] — End-to-end guide
3. [[Adding a New View]] — How to add UI features
4. [[Build and Release]] — How we ship

## Codebase Navigation Cheat Sheet

| "I need to..." | Look here |
|---|---|
| Find a git operation | `services/git_service.go` |
| Find a frontend component | `frontend/src/` |
| Check available bindings | `frontend/bindings/controlzebra/services/` |
| Understand a view/page | `frontend/src/components/layout/views/` and `pages/` |
| See UI primitives | `frontend/src/components/ui/` |
| Check frontend constants | `frontend/src/constants/index.ts`, [[Constants Reference]] |
| Understand data persistence | [[Data Storage Reference]], [[Data Paths]] |
| Debug CLI execution | [[CommandRunner]], [[Debug Logger]] |

## Common Patterns You'll See

### Backend: OperationResult

Every mutation method returns:

```go
type OperationResult struct {
    Success bool   `json:"success"`
    Message string `json:"message"`
    Error   string `json:"error,omitempty"`
}
```

### Frontend: Context + Binding

```tsx
// 1. Import the binding (auto-generated from Go)
import { GetStatus } from '../../bindings/controlzebra/services/gitservice';

// 2. Call it from a React component
const status = await GetStatus(repoPath);

// 3. Or use it through RepoContext (preferred for shared state)
const { status } = useRepo();
```

### Frontend: Icon Sizes

```tsx
import { ICON_SIZES } from '../constants';
import { FolderOpen } from 'lucide-react';

<FolderOpen size={ICON_SIZES.md} />
```

## Who to Ask

| Topic | Contact |
|---|---|
| Architecture decisions | Project lead |
| Git workflow questions | Check [[Git Workflows]] first |
| Build/release issues | Check [[Build and Release]] first |
| UI/UX questions | Check [[User-Facing Terminology]] first |

## Next Steps

- [[Development Setup]] — Get your environment running
- [[Development Workflow]] — Our branch strategy and PR process
- [[Documentation Standards]] — How we maintain these docs

---

**Related:** [[Development Setup]] | [[Architecture Overview]] | [[Product Overview]]
