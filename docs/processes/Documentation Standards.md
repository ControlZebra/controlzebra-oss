# Documentation Standards

> How we write and maintain ControlZebra documentation.

## Structure

All documentation lives in `docs/` with this structure:

```
docs/
  HOME.md                          → Main index (start here)
  product/                         → Non-technical product docs
  technical/
    architecture/                  → System design & patterns
    backend/                       → Go backend docs
      services/                    → Individual service docs
    frontend/                      → React frontend docs
      features/                    → Feature-specific docs
    infrastructure/                → CLI runner, data paths, logging
    guides/                        → How-to guides
    reference/                     → Constants, events, env vars
    archive/                       → Old docs (preserved for reference)
  onboarding/                      → New engineer docs
  processes/                       → Team workflow docs
```

## Writing Guidelines

### Audience

- **Product docs** (`product/`): Written for anyone. No code, no Git jargon.
- **Technical docs** (`technical/`, `onboarding/`, `processes/`): Written for engineers. Code is expected, but explain *why*, not just *what*.

### Format

Every documentation page should include:

1. **Title** — `# Page Name` (matches the filename)
2. **Summary** — One-line blockquote below the title: `> What this page covers`
3. **Body** — Content organized with `##` and `###` headings
4. **Related links** — At the bottom: `**Related:** [[Page1]] | [[Page2]]`

### Cross-Linking

Use Obsidian `[[wiki-link]]` syntax:

```markdown
See [[Architecture Overview]] for the full picture.
The [[CommandRunner]] handles all CLI execution.
Check [[GitService#Commit Methods]] for details.
```

- Link to page: `[[Page Name]]`
- Link to section: `[[Page Name#Section]]`
- Aliased link: `[[Page Name|display text]]`

### Code Blocks

Always specify the language:

````markdown
```go
func (g *GitService) CommitAll(repoPath, message string) OperationResult {
```

```tsx
const { status } = useRepo();
```

```bash
task dev
```
````

### Tables

Use tables for reference data, parameter lists, and comparisons:

```markdown
| Parameter | Type | Description |
|---|---|---|
| `repoPath` | `string` | Absolute path to the repository |
| `message` | `string` | Commit message |
```

## When to Update Docs

| Change | Documentation Action |
|---|---|
| New Go service | Add to [[Services Index]], create service page in `backend/services/` |
| New service method | Update the relevant service doc |
| New frontend view | Update [[Layout System]], create feature doc if substantial |
| New viewer | Update [[Viewer System]], follow [[Adding a New Viewer]] |
| New event | Update [[Event Reference]] and [[Event System]] |
| New constant | Update [[Constants Reference]] |
| Changed env var | Update [[Environment Variables]] |
| New build step | Update [[Build and Release]] and [[Development Setup]] |
| Architecture decision | Update relevant architecture doc |

## File Naming

- Use **Title Case with spaces**: `Adding a New Service.md`, not `adding-a-new-service.md`
- Obsidian handles spaces in filenames natively
- Keep names concise but descriptive

## Maintenance

- Review docs quarterly for accuracy
- After major refactors, audit affected pages
- Archive outdated docs to `docs/technical/archive/` rather than deleting

---

**Related:** [[HOME]] | [[Onboarding Guide]] | [[Development Workflow]]
