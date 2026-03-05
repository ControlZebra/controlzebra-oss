# shared

Cross-cutting primitives used by multiple domains/features.

## Ownership
- Reusable constants
- Generic utilities
- Runtime-safe helpers
- Shared UI-agnostic building blocks

## Rules
- Must not import from `domain`, `features`, `widgets`, or `viewers`
- Keep dependencies low-level and stable
