# Supabase Auth Integration Plan (Email + Password)

## Goal
Require users to log in with email + password before they can use ControlZebra Desktop. The app should be unusable until authenticated, with a persistent session across restarts.

## Assumptions
- Supabase Auth is configured for Email/Password only.
- Desktop login happens inside the Wails UI (no external browser).
- Session tokens are stored securely via the backend (OS keychain/credential store), not in plain localStorage.

## Architecture Overview
- **Frontend (React + Wails bindings)** handles UI and uses `@supabase/supabase-js` to sign in.
- **Backend (Go)** provides:
  - Secure token storage (keychain/credential store).
  - A small auth API surface to get/set session and validate tokens as needed.
- **App gating**: The root layout renders the login view unless a valid session is present.

## Implementation Steps

### 1) Supabase Project Setup
- Create Supabase project.
- Enable Email/Password auth.
- Configure project URL + anon key for the desktop app.
- Set redirect URLs if needed for password reset.

### 2) Frontend Auth Client
- Add `@supabase/supabase-js` to frontend dependencies.
- Create a `frontend/src/services/supabaseClient.ts`:
  - Initialize client with URL + anon key.
  - Provide `signInWithPassword`, `signOut`, `getSession`, `refreshSession`.
- Add environment configuration (Vite) for Supabase URL + anon key.

### 3) Backend Token Storage
- Create a new Go service `services/auth_service.go` with methods:
  - `SaveSession(sessionJSON string)`
  - `LoadSession() (sessionJSON string)`
  - `ClearSession()`
- Store session securely using OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
- Expose service via Wails in `main.go`.

### 4) Frontend Auth State + Gate
- Add `AuthContext` (or extend `RepoContext`) to track:
  - `session`, `isLoading`, `isAuthenticated`.
- On app start:
  - Load session from backend.
  - Hydrate Supabase client.
  - Validate session (refresh if needed).
- If unauthenticated: render Login view only.
- If authenticated: render the main app layout.

### 5) Login UI
- Create `frontend/src/components/layout/views/LoginView.jsx`:
  - Email + password inputs.
  - Sign in button, loading state, error messaging.
- On success:
  - Save session via backend.
  - Update auth context and unlock UI.

### 6) Logout Flow
- Add logout button in profile/settings:
  - `supabase.auth.signOut()`
  - Clear backend session store.
  - Return to login view.

### 7) Enforcement + Edge Cases
- Block all Git operations when unauthenticated.
- Token expiry:
  - Attempt refresh on app start and before critical operations.
  - If refresh fails, force logout.
- Offline:
  - If no network and session can’t refresh, lock app with a clear message.

## Deliverables
- New plan + auth service + login UI view.
- Secure session persistence.
- App-wide auth gate.

## Follow-Up Checklist
- Decide where Supabase config lives (env file vs settings UI).
- Confirm keychain library choice for Go (cross-platform).
- Add tests for auth service storage and auth gating.
