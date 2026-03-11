# Frontend Architecture

This document is the canonical structure guide for `frontend/src`.

## Goals

- Keep user-facing behavior stable while improving maintainability
- Make ownership boundaries explicit
- Centralize file-viewer and diff-viewer routing logic

## Top-Level Ownership

| Directory | Responsibility |
|-----------|---------------|
| `app/` | Application bootstrap, entry point, and provider composition |
| `shared/` | Low-level reusable primitives, constants, hooks, UI components, runtime helpers |
| `domain/` | Domain logic, services, and non-UI state/polling concerns |
| `features/` | User-facing workflows composed from domain + shared |
| `viewers/` | Viewer/diff-viewer registries, resolution, and shared viewer rendering |
| `widgets/` | Higher-level composed UI sections (layout shell) |
| `context/` | Context barrel — facade re-exporting providers/hooks from `domain/` + `LayoutContext` |

## Import Direction Rules

Primary direction (preferred):

`shared → domain → features → viewers → widgets → app`

Additional rules:

- `shared` must not import from `domain`, `features`, `widgets`, `viewers`, or `app`
- `domain` should avoid UI-framework-specific behavior when possible
- `viewers` owns file-kind/diff-kind routing and shared diff rendering abstractions
- Page-level modules should not duplicate viewer/diff matching logic
- All modules import context providers/hooks through the `context/` barrel

## Directory Structure

```
src/
├── app/                          # Application bootstrap
│   ├── App.tsx                   # Root component (auth gate, providers)
│   ├── main.tsx                  # Entry point (PostHog, React root)
│   ├── bootstrap/                # Startup-specific setup logic
│   └── providers/                # Provider wrappers (Auth, Repo, Analytics)
│
├── context/                      # Context facade barrel
│   ├── index.ts                  # Re-exports from domain/ + LayoutContext
│   └── LayoutContext.tsx          # UI state (365 lines — sidebar, theme, tabs)
│
├── domain/                       # Business domain logic
│   ├── analytics/                # PostHog analytics helpers
│   ├── auth/
│   │   ├── context/              # AuthContext (Supabase session)
│   │   └── services/             # Auth service helpers
│   └── repo/
│       ├── context/              # RepoContext (3,000+ lines, git state machine)
│       ├── polling/              # Repo polling/refresh logic
│       ├── selectors/            # Derived state selectors
│       └── services/             # LFS auto-track, domain services
│
├── features/                     # User-facing feature modules
│   ├── auth/components/          # LoginView, GitHubDeviceFlowModal
│   ├── debug/{components,pages}/ # Debug logging UI
│   ├── explorer/                 # File explorer, commit, sync workflows
│   │   ├── components/           # ExplorerView, FileBrowser, DiffViewer, etc.
│   │   ├── hooks/                # useLfsAutoTrackBeforeSave
│   │   └── pages/                # AllSynced, Commit, MergeRequest, ReadyToPush
│   ├── history/{components,pages,utils}/ # Commit history, git graph
│   ├── merge/{components,pages}/ # Merge conflicts, review diffs
│   ├── profile/{components,pages}/ # User profile
│   ├── repo-settings/            # Per-repo settings (branches, LFS, perf)
│   │   ├── components/hooks/pages/panels/
│   ├── settings/{components,pages}/ # App settings (general, git config)
│   └── welcome/                  # Onboarding, project creation, clone
│       ├── components/           # RepoSwitcher, PublishToCloudModal
│       └── pages/                # RecentProjects, NewProject, Clone, OpenFolder
│
├── shared/                       # Cross-cutting reusable code
│   ├── constants/                # VIEWS, ICON_SIZES, FILE_STATUS, file-types
│   ├── hooks/                    # useWindowSize, useLoginTheme, useAnalytics
│   ├── icons/                    # Custom icon components (GitLabIcon)
│   ├── runtime/                  # Wails wrappers (events.ts, browser.ts)
│   ├── test/                     # Shared test utilities
│   ├── ui/                       # shadcn-style Radix primitives + common components
│   │   ├── alert-dialog, badge, button, card, ... (Radix primitives)
│   │   ├── EmptyState, LoadingState, Spinner, RecoveryBanner (common UI)
│   │   └── sonner (toast notifications)
│   └── utils/                    # misc (cn), gitHelpers, pathUtils, recentFolders
│
├── viewers/                      # File viewer system
│   ├── registry/                 # viewer-registry.ts, diff-registry.ts, diff-builtins
│   └── components/
│       ├── file/                 # TextViewer, ImageViewer, PDFViewer, Model3DViewer
│       │   └── l5x/             # L5X sub-components
│       ├── diff/                 # TextDiffViewer, ImageDiffViewer, PDFDiffViewer
│       │   └── l5x-diff/        # L5X diff sub-components
│       └── shared/               # ViewerHeader, ViewerRenderer, DiffRenderer
│
├── widgets/
│   └── layout/                   # VS Code-like layout shell
│       ├── AppLayout, TopBar, ActivityBar, Sidebar, MainArea, StatusBar
│       ├── BranchModal, BranchNameModal, RewindConfirmModal, SwitchProjectModal
│       └── view-registry.ts      # VIEW_REGISTRY mapping ViewType → page components
│
├── scripts/                      # Build-time hygiene enforcement
│   └── enforce-frontend-hygiene.mjs
│
├── index.css                     # Global styles (Tailwind v4)
└── vite-env.d.ts                 # Vite type declarations
```

## Viewer and Diff Routing

Canonical file-type constants live in `shared/constants/file-types.ts`.

- File viewer routing resolves from shared file-kind constants
- Diff viewer routing resolves through `viewers/registry/diff-registry.ts`
- Built-in diff registrations live in `viewers/registry/diff-builtins.tsx`
- Shared renderer abstraction is `viewers/components/shared/DiffRenderer.tsx`

## Runtime Wrappers

| Concern | Module | Notes |
|---------|--------|-------|
| External URL opening | `shared/runtime/browser.ts` | Wraps Wails browser API |
| Wails event listening | `shared/runtime/events.ts` | Typed `onEvent()` with `AppEvent` union |

Do not call Wails runtime APIs directly from feature/page components.

## Hygiene Enforcement

The frontend enforces source-tree hygiene with:

- `npm run lint` (runs `lint:hygiene`)
- `npm run lint:hygiene` (fails on disallowed `.jsx` files under `src` and generated bindings under `src/components/**/frontend/bindings`)
- `npm run ci:guards` (hygiene + typecheck)

## File Placement Guidelines

When adding code, prefer this order:

1. If generic and cross-cutting → `shared/`
2. If business-domain behavior → `domain/`
3. If end-user workflow composition → `features/<feature>/`
4. If viewer-related routing/rendering → `viewers/`
5. If reusable composed UI section → `widgets/`

## Context Barrel Pattern

`context/index.ts` is a facade that re-exports all context providers and hooks:

- `LayoutContext` lives directly in `context/` (primary file, 365 lines)
- `AuthContext` lives in `domain/auth/context/` — re-exported through the barrel
- `RepoContext` lives in `domain/repo/context/` — re-exported through the barrel

All consumers import from the barrel: `import { useRepo, useLayout, useAuth } from '../context'`
