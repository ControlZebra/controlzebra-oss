# Frontend Architecture (Current)

This document is the canonical structure guide for `frontend/src`.

## Goals

- Keep user-facing behavior stable while improving maintainability
- Make ownership boundaries explicit
- Centralize file-viewer and diff-viewer routing logic

## Top-Level Ownership

- `app/` — application bootstrap and provider composition only
- `shared/` — low-level reusable primitives, constants, runtime-safe helpers
- `domain/` — domain logic, services, and non-UI state/polling concerns
- `features/` — user-facing workflows composed from domain + shared
- `viewers/` — viewer and diff-viewer registries, resolution, shared viewer rendering
- `widgets/` — higher-level composed UI sections
- `components/` — existing UI components/pages while migration continues
- `context/` — existing context APIs (including stable `RepoContext` contract)

## Import Direction Rules

Primary direction (preferred):

`shared -> domain -> features -> widgets -> app`

Additional rules:

- `shared` must not import from `domain`, `features`, `widgets`, `viewers`, or `app`
- `domain` should avoid UI-framework-specific behavior when possible
- `viewers` owns file-kind/diff-kind routing and shared diff rendering abstractions
- Page-level modules should not duplicate viewer/diff matching logic

## Viewer and Diff Routing

Canonical file-type constants live in `shared/constants/file-types.ts`.

- File viewer routing resolves from shared file-kind constants
- Diff viewer routing resolves through `viewers/registry/diff-registry.ts`
- Built-in diff registrations live in `viewers/registry/diff-builtins.tsx`
- Shared renderer abstraction is `viewers/components/shared/DiffRenderer.tsx`

## Runtime URL Opening

All external URL launches must go through:

- `shared/runtime/browser.ts`

Do not call Wails browser runtime APIs directly from feature/page components.

## Hygiene Enforcement

The frontend enforces source-tree hygiene with:

- `npm run lint` (runs `lint:hygiene`)
- `npm run lint:hygiene` (fails on disallowed `.jsx` files under `src` and generated bindings under `src/components/**/frontend/bindings`)
- `npm run ci:guards` (hygiene + typecheck)

## File Placement Guidelines

When adding code, prefer this order:

1. If generic and cross-cutting: `shared/`
2. If business-domain behavior: `domain/`
3. If end-user workflow composition: `features/`
4. If viewer-related routing/rendering: `viewers/`
5. If reusable composed UI section: `widgets/`
6. If only touching legacy area during migration: `components/`/`context/`

## Migration Notes

The project is in progressive migration. Existing modules under `components/` and `context/` remain valid while responsibilities are moved incrementally into `domain`, `features`, `viewers`, and `shared`.
