# ControlZebra Desktop - Optional Account / Guest Mode Plan

## Goal

Remove the startup sign-in blocker so users can use ControlZebra Desktop without creating or signing into a ControlZebra account.

ControlZebra account login remains available as an optional capability for future cloud-backed features. GitHub authentication also remains optional and separate.

## Product Decision

The desktop app's primary value is local Git workflows for non-technical users. That core workflow should not depend on a ControlZebra account.

Target behavior:
- App launches directly into the product whether or not the user is signed in.
- Users can open folders, start tracking, review changes, save changes, sync, branch, inspect history, and resolve merge workflows as guests.
- Users can sign in later from Profile, Settings, or a welcome callout.
- Account-backed features can require login when they actually need it.

## Why This Change Is Needed

Current behavior makes account login a prerequisite for basic local use. That creates unnecessary friction before the user has received any value from the product.

Problems with the current model:
- First-run experience is blocked by sign-in before the user can explore the app.
- Offline or partially configured environments become fragile because auth is part of app boot.
- Git identity and ControlZebra account identity are treated as if they are the same requirement.
- The product message is confusing: users may assume they need a cloud account just to save local changes.

## Current State

### Current startup gate
- `frontend/src/app/App.tsx` renders `LoginView` whenever `isAuthenticated` is false.
- `frontend/src/domain/auth/context/AuthContext.tsx` models auth as a gate for the entire app shell.
- `frontend/src/domain/auth/supabaseClient.ts` throws if Supabase config is missing.

### Current coupling to core repo workflows
- `frontend/src/domain/repo/context/RepoContext.tsx` reads `userName` and `userEmail` from `useAuth()`.
- Repo open and repo setup call `EnsureIdentity(...)` so Git identity can be auto-populated from the authenticated account if local/global git config is missing.
- `services/settings_service.go` already tolerates empty fallback values and only writes missing identity fields if non-empty values are available.

### Current optional areas already separated correctly
- GitHub CLI auth is handled independently from ControlZebra account auth.
- Profile and Settings already contain account-related UI that can host optional sign-in entry points.

## Desired End State

After this work:
- Auth is optional infrastructure, not a boot prerequisite.
- Missing Supabase configuration does not crash the app.
- The app always renders its main shell after initial startup loading.
- ControlZebra account state is one of:
  - authenticated
  - guest
  - auth unavailable
- Core Git workflows work in guest mode.
- Git author identity is prompted for when needed, not implied by account login.

## Non-Goals

- This plan does not remove ControlZebra account support.
- This plan does not replace GitHub CLI authentication flows.
- This plan does not define final cloud feature entitlements.
- This plan does not redesign the entire onboarding experience beyond removing the blocking auth gate.

## Architecture Changes

### 1. Make Supabase optional at runtime

`frontend/src/domain/auth/supabaseClient.ts` should stop throwing during module initialization when env vars are missing.

Instead:
- Detect whether Supabase is configured.
- Export a capability signal such as `isSupabaseConfigured()` or `authRuntime.mode`.
- Return safe failures for sign-in and session-refresh operations when auth is unavailable.
- Keep the client instance creation lazy or guarded so startup never hard-fails.

Result:
- Developers can run the app without auth configuration.
- Production builds can still enable auth when env vars are present.

### 2. Replace the app-wide auth gate with optional auth state

`frontend/src/app/App.tsx` should no longer render `LoginView` as the fallback app shell.

New behavior:
- Show a short startup loading state while session hydration runs.
- Render `RepoProvider` and `AppLayout` regardless of login state.
- Move sign-in UI behind explicit user actions inside the app.

Result:
- Guest mode becomes the default unlocked state.

### 3. Expand AuthContext to model guest mode explicitly

`frontend/src/domain/auth/context/AuthContext.tsx` should expose optional-auth semantics instead of binary gated-auth semantics.

Suggested state model:
- `isLoading`
- `isAuthenticated`
- `isGuest`
- `isAuthAvailable`
- `userEmail`
- `userName`
- `authError`

Suggested behavior:
- If auth runtime is unavailable, settle into `guest` instead of surfacing a fatal error.
- If there is no stored session, settle into `guest`.
- If session hydration fails, clear stored session and settle into `guest`, preserving a non-blocking warning if needed.
- Login and logout switch between `guest` and `authenticated` without affecting access to the app shell.

### 4. Keep feature gating local to the feature

Views or actions that truly require a ControlZebra account should check auth at the feature level instead of relying on a root gate.

Examples:
- Future settings sync can require a signed-in account.
- Future collaboration or workspace-sharing flows can require a signed-in account.
- Local repository operations should not require a ControlZebra account.

### 5. Treat Git identity as a Git workflow requirement, not an auth requirement

Current logic already uses auth identity only as a fallback. That behavior should remain optional, but not required.

Desired rule:
- If local or global Git identity exists, use it.
- If authenticated ControlZebra account data exists, it can be used as a convenience fallback.
- If identity is still missing, prompt the user when identity becomes necessary.

Recommended trigger points:
- Before the first commit.
- Optionally during `Start Tracking` if the product wants setup to feel guided.

Recommended UX language:
- "Name used for saved changes"
- "Email used in revision history"

This language is clearer for the target audience than exposing Git jargon or linking identity to a cloud account.

## UI Changes

### Remove blocking login screen behavior
- `LoginView` should no longer own the full-screen default app experience.
- It can be repurposed as:
  - an account modal,
  - an account page section,
  - or a dedicated optional sign-in view reachable from Profile.

### Update account surfaces
- Profile should present account connection as optional.
- Settings should stop saying sign-in is required to use the app.
- Welcome surfaces can include a secondary callout such as:
  - "Use ControlZebra without an account. Sign in later to unlock cloud features."

### Preserve GitHub connection as a separate concept
- GitHub connection remains handled through GitHub CLI auth.
- Copy should clearly distinguish:
  - ControlZebra account
  - GitHub connection
  - Git identity for commits

## Implementation Plan

### Phase 1 - Unblock app startup

Goal: make the app boot into the main shell without requiring auth.

Status: Complete on March 25, 2026.

Changes:
- Update `supabaseClient.ts` to support unconfigured auth safely.
- Update `AuthContext.tsx` to settle into guest mode.
- Remove the blocking branch in `App.tsx` that returns `LoginView` for unauthenticated users.
- Ensure startup loading only covers session hydration, not account enforcement.

Implementation notes:
- `frontend/src/domain/auth/supabaseClient.ts` now treats missing Supabase env vars as an unavailable optional capability instead of a startup exception.
- `frontend/src/domain/auth/context/AuthContext.tsx` now exposes `isGuest` and `isAuthAvailable`, and settles into guest mode when auth is unavailable or no valid session exists.
- `frontend/src/app/App.tsx` now always renders the main app shell after auth hydration finishes.

Definition of done:
- App boots without a signed-in session.
- App boots when Supabase env vars are absent.
- No fatal startup auth exception occurs.

Next step guidance:
- Start Phase 2 by moving sign-in behind explicit in-app entry points in Profile and Settings.
- Rework account copy so it explains cloud features are optional and local Git use remains available to guests.

### Phase 2 - Move sign-in into optional in-app entry points

Goal: preserve login support without making it mandatory.

Status: Complete on March 25, 2026.

Changes:
- Reposition `LoginView` into an optional account flow.
- Add sign-in entry points from Profile and optionally Settings/Welcome.
- Update copy across Profile and Settings to communicate optional account usage.
- Keep logout behavior but return users to guest mode instead of a blocker screen.

Implementation notes:
- `frontend/src/features/auth/components/LoginView.tsx` now supports an embedded variant for in-app account entry points and shows guest-safe messaging when account auth is unavailable.
- `frontend/src/features/profile/pages/ProfilePage.tsx` now hosts the optional ControlZebra account sign-in/sign-out flow while keeping GitHub connection separate.
- `frontend/src/features/profile/components/ProfileView.tsx` and `frontend/src/features/settings/components/GeneralSettings.tsx` now describe account access as optional instead of required.

Definition of done:
- Users can sign in after launch.
- Users can sign out and continue using the app.
- UI no longer implies the product is unusable without login.

Next step guidance:
- Start Phase 3 by auditing first-commit and repo-setup paths for missing Git identity handling in guest mode.
- Add a clear name/email prompt at the first workflow that truly requires commit identity.

### Phase 3 - Harden Git identity flow for guest users

Goal: ensure guest users can commit cleanly without relying on account auth.

Status: Complete on March 25, 2026.

Changes:
- Audit the commit and repo setup flows for missing-identity behavior.
- Add an explicit prompt if `user.name` or `user.email` is missing and no fallback exists.
- Keep current `EnsureIdentity(...)` behavior for authenticated users as an auto-fill convenience.
- Decide whether identity should save locally by default, with optional global save.

Implementation notes:
- `frontend/src/domain/repo/context/RepoContext.tsx` now pauses commit-producing workflows when effective Git identity is missing and resumes them after the user supplies a name and email.
- `frontend/src/widgets/layout/GitIdentityPromptModal.tsx` now presents a guest-safe prompt using plain-language commit identity labels and defaults to saving identity only for the current project, with an opt-in switch to save globally.
- Start Tracking and New Project flows now prompt before the first commit instead of failing silently or leaving guests at an auth dead end.

Definition of done:
- Guest users with existing Git identity can commit immediately.
- Guest users without Git identity receive a clear prompt instead of an auth dead end.

Next step guidance:
- Start Phase 4 by documenting which future features truly require a ControlZebra account.
- Add feature-level account guards only at those feature entry points so guest access stays intact for local workflows.

### Phase 4 - Feature-level gating for future cloud capabilities

Goal: make future account-restricted features composable and explicit.

Status: Complete on March 25, 2026.

Changes:
- Introduce simple account-required guards at the feature boundary.
- Avoid reintroducing root-level auth gating.
- Document which features require ControlZebra auth and which remain local-only.

Implementation notes:
- `frontend/src/features/auth/components/AccountFeatureGate.tsx` now provides a reusable feature-level account guard that keeps gating local to the feature surface instead of app startup.
- `frontend/src/features/profile/pages/ProfilePage.tsx` now documents the first account-scoped feature entry points (`Settings Sync`, `Shared Workspaces`, and `Cloud Activity Feed`) and makes their account requirement explicit without blocking guest usage elsewhere.
- Profile now also calls out the workflows that remain guest-safe: local repository work, Git identity, and GitHub sync.

Definition of done:
- Account restrictions are applied only where the feature actually requires them.

Next step guidance:
- Reuse `AccountFeatureGate` when the first real cloud-backed workflow ships so each feature can enforce sign-in locally.
- Add focused UI tests for any new account-scoped action to verify guest users see a local prompt instead of being redirected or blocked globally.

## Testing Plan

### Guest mode startup
- No stored session -> app opens normally.
- Missing Supabase env vars -> app opens normally.
- Invalid stored session -> session is cleared and app opens in guest mode.

### Core workflows as guest
- Open existing repo.
- Open non-repo folder.
- Start tracking a folder.
- Review status, history, diffs, and merge state.
- Commit when Git identity already exists.

### Identity fallback behavior
- Authenticated user with no git identity -> identity auto-fills from account where appropriate.
- Guest user with no git identity -> explicit identity prompt appears before commit.
- Guest user with global git identity -> no extra prompt.

### Optional account behavior
- Sign in from inside the app.
- Sign out and remain in the app as guest.
- Auth unavailable state does not break Profile or Settings rendering.

## Risks

### Risk: hidden assumptions about authenticated users
Some parts of the frontend may implicitly assume `userName` or `userEmail` are non-null.

Mitigation:
- Audit `useAuth()` consumers.
- Keep nullable types explicit.
- Treat account data as optional presentation data.

### Risk: auth copy remains inconsistent
Some screens may still suggest sign-in is mandatory.

Mitigation:
- Audit account-related copy in Settings, Profile, and Welcome surfaces.

### Risk: guest users get stuck on first commit if identity handling is incomplete

Mitigation:
- Ship Phase 3 promptly after Phase 1 if commit flows do not already present a clear fallback.

## Rollout Recommendation

Recommended rollout order:
1. Ship guest-mode startup first.
2. Move sign-in to optional entry points.
3. Tighten guest identity prompts.
4. Add feature-level auth gates only for future cloud capabilities.

This ordering delivers the main product benefit early: the app becomes usable immediately without waiting for broader account-work redesign.

## Success Criteria

- A first-time user can install and open ControlZebra Desktop without creating an account.
- A guest user can complete the core local Git workflow.
- A signed-in user still receives account convenience benefits.
- The app no longer conflates ControlZebra account login with Git identity or GitHub authentication.

## Related Documents

- `docs/plans/SUPABASE_AUTH_PLAN.md` describes the original gated-auth direction.
- This document supersedes the startup-blocking portion of that plan and replaces it with an optional-account model.