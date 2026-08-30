# Development Workflow

> How we develop, branch, review, and merge code.

## Branch Strategy

### Branch Naming

```
feat/<short-description>      → New features
fix/<short-description>       → Bug fixes
refactor/<short-description>  → Code restructuring
docs/<short-description>      → Documentation changes
chore/<short-description>     → Maintenance, deps, CI
```

### Protected Branches

- `main` — Production-ready code. All PRs merge here
- `release/*` — Release branches (when applicable)

Never commit directly to `main`. Always use feature branches.

### Workflow

```
main ← PR ← feat/my-feature
```

1. Create a branch from `main`
2. Make changes, commit frequently with descriptive messages
3. Push branch, open PR
4. Get review, address feedback
5. Squash merge into `main`

## Commit Messages

Use clear, descriptive commit messages:

```
feat: add PDF diff viewer for side-by-side comparison
fix: resolve stash apply failure when conflicts exist
refactor: extract CommandRunner timeout logic
docs: update onboarding guide with new setup steps
chore: bump Wails to alpha.69
```

Format: `<type>: <description>`

Types: `feat`, `fix`, `refactor`, `docs`, `chore`, `test`, `style`

## Pull Request Process

### Before Opening a PR

1. **Run all checks locally:**
   ```bash
   go test ./services/... -v
   cd frontend && npm run ci:guards && npm test
   ```
2. **Regenerate bindings** if you changed Go service methods:
   ```bash
   task common:generate:bindings
   ```
3. **Test the feature manually** in `task dev` mode

### PR Template

- **What:** Brief description of the change
- **Why:** What problem this solves
- **How:** Key implementation decisions
- **Testing:** How you verified it works
- **Screenshots:** For UI changes

### Review Process

- At least one approval required before merge
- Reviewer checks: correctness, edge cases, user-facing terminology ([User-Facing Terminology](../product/User-Facing%20Terminology.md)), performance
- For UI changes: verify on both macOS and Windows if possible

## Code Quality Standards

### Backend (Go)

- All exported methods must have clear names matching their purpose
- Mutation operations return `OperationResult{Success, Message, Error}`
- Use [CommandRunner](../technical/infrastructure/CommandRunner.md) for all CLI execution — never use `exec.Command` directly
- Add tests for new services and complex logic (see [Testing Guide](../technical/guides/Testing%20Guide.md))

### Frontend (TypeScript/React)

- Strict TypeScript — no `any` types unless absolutely necessary
- Components should be wrapped with `memo()` when appropriate
- Use `useCallback` for event handlers passed as props
- Follow [UI Components](../technical/frontend/UI%20Components.md) patterns — use shadcn-style primitives from `components/ui/`
- Icons: `lucide-react` only, sized via `ICON_SIZES` constant

### User-Facing Text

- Never use raw Git jargon in the UI
- Always consult [User-Facing Terminology](../product/User-Facing%20Terminology.md) for label mapping
- Error messages should tell the user what happened AND what to do

## Feature Development Checklist

```
□ Branch created from latest main
□ Backend service methods added/modified
□ Bindings regenerated
□ Frontend components/views created
□ Tests written (backend and/or frontend)
□ Manual testing in dev mode
□ User-facing text follows terminology guide
□ PR opened with description
□ CI checks pass
□ Code review approved
□ Squash merged to main
```

---

**Related:** [Development Setup](../onboarding/Development%20Setup.md) | [Testing Guide](../technical/guides/Testing%20Guide.md) | [Build and Release](../technical/guides/Build%20and%20Release.md) | [Documentation Standards](Documentation%20Standards.md)
