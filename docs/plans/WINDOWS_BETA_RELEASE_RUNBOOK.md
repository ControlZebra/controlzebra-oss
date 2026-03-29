# Windows Beta Release Runbook (Recurring)

This runbook standardizes the recurring workflow to:
1) bump the desktop app version,
2) build/package Windows artifacts,
3) publish update metadata and binaries to the `controlzebra-releases` repo.

---

## Scope

- Project: `ControlZebra-Desktop`
- Channel: `beta`
- Targets: `windows-amd64`, `windows-arm64`
- Release repo: `../controlzebra-releases`

---

## Inputs per release

Set these before starting:

- `VERSION` (example: `v0.4.0-beta`)
- `RELEASE_NOTES_MD` (markdown release notes)
- Optional: mandatory/min-version policy for updater

> Convention: include leading `v` in published release version (`v0.4.0-beta`).

---

## Prerequisites

From `ControlZebra-Desktop`:

- `wails3`, `task`, `go`, `node`, `npm`, `makensis`
- Windows packaging deps already configured (NSIS, icons, manifest)
- `osslsigncode` installed (required for local self-signed artifact signing)
- Signing key available if signing `update.json` (`CZ_SIGNING_KEY`)

Installer expectation for the current Windows channel:

- Per-user install root is `%LOCALAPPDATA%\Programs\ControlZebra`
- Standard-user install/update should not prompt for UAC

---

## Step 1 — Bump app metadata version

Update version in build config:

- `build/config.yml` → `info.version: "vX.Y.Z-beta"`

Regenerate Wails build assets:

```bash
task common:update:build-assets
```

This updates generated build metadata used by Windows packaging (for example `build/windows/info.json`, NSIS metadata, and Windows manifest values).

---

## Step 2 — Build + package Windows artifacts

Build/package both Windows architectures:

```bash
APP_VERSION=$VERSION task windows:package ARCH=amd64
APP_VERSION=$VERSION task windows:package ARCH=arm64
```

Expected outputs in `bin/`:

- `control-zebra.exe` (last built arch generic output)
- `control-zebra-amd64-installer.exe`
- `control-zebra-arm64-installer.exe`
- `control-zebra-windows-amd64.exe`
- `control-zebra-windows-arm64.exe`

Quick size sanity check:

```bash
ls -lh bin/control-zebra-amd64-installer.exe bin/control-zebra-arm64-installer.exe
```

---

## Step 3 — Self-sign Windows artifacts (beta/internal)

Generate/refresh local self-signed certificate:

```bash
task windows:cert:selfsigned
```

Sign executable + installers:

```bash
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra-amd64-installer.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra-arm64-installer.exe
```

Verify signatures (self-signed mode):

```bash
CZ_WINDOWS_SELF_SIGNED=true task windows:verify:artifact INPUT=bin/control-zebra.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:verify:artifact INPUT=bin/control-zebra-amd64-installer.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:verify:artifact INPUT=bin/control-zebra-arm64-installer.exe
```

Notes:
- Self-signed signing is intended for beta/internal distribution.
- Signature verification output will mention self-signed certificate trust; this is expected in local/internal mode.

---

## Step 4 — Generate manifest/checksums (recommended)

Generate release manifest and checksums from built binaries:

```bash
./scripts/create-release.sh \
  --version "${VERSION#v}" \
  --channel beta \
  --notes @RELEASE_NOTES.md
```

Notes:
- `create-release.sh` expects semantic version without leading `v`, so `${VERSION#v}` is used.
- Output is created under `release/<version-without-v>/`.

Optional signed manifest generation:

```bash
./scripts/create-release.sh \
  --version "${VERSION#v}" \
  --channel beta \
  --notes @RELEASE_NOTES.md \
  --sign
```

---

## Step 5 — Publish to controlzebra-releases (current manual flow)

Repository: `../controlzebra-releases`

### 4.1 Create release artifact folder

Create:

- `releases/download/$VERSION/`

Copy installers:

- `ControlZebra-Desktop/bin/control-zebra-amd64-installer.exe`
- `ControlZebra-Desktop/bin/control-zebra-arm64-installer.exe`

Into:

- `controlzebra-releases/releases/download/$VERSION/`

### 4.2 Update updater manifest

Edit:

- `controlzebra-releases/desktop/beta/update.json`

Set fields:

- `version`: `$VERSION`
- `releaseDate`: current UTC timestamp (ISO8601)
- `releaseNotes`: markdown notes for this release
- `platforms.windows-amd64.url`: points to `.../releases/download/$VERSION/control-zebra-amd64-installer.exe`
- `platforms.windows-arm64.url`: points to `.../releases/download/$VERSION/control-zebra-arm64-installer.exe`
- `size`: file size in bytes
- `checksum`: `sha256:<hash>`

### 4.3 Sign update manifest

From `ControlZebra-Desktop`:

```bash
go run ./scripts/signing/ sign \
  --file ../controlzebra-releases/desktop/beta/update.json
```

Copy/ensure signature file at:

- `controlzebra-releases/desktop/beta/update.json.sig`

### 4.4 Verify signature (strongly recommended)

```bash
go run ./scripts/signing/ verify \
  --file ../controlzebra-releases/desktop/beta/update.json \
  --sig ../controlzebra-releases/desktop/beta/update.json.sig
```

### 4.5 Commit + push release repo

In `controlzebra-releases` commit:

- new binaries under `releases/download/$VERSION/`
- updated `desktop/beta/update.json`
- updated `desktop/beta/update.json.sig`

Push to default branch used by GitHub Pages.

---

## Step 6 — Post-publish verification

1. Open `https://controlzebra.github.io/controlzebra-releases/desktop/beta/update.json`
2. Confirm `version`, URLs, checksums.
3. Test one updater check locally (from Desktop repo):

```bash
./bin/cz-updater check \
  --url https://controlzebra.github.io/controlzebra-releases/desktop/beta/ \
  --current 0.0.0-dev \
  --os windows \
  --arch amd64
```

Expected: `available: true` and new version details.

Installer smoke checks on Windows:

1. Fresh install lands under `%LOCALAPPDATA%\Programs\ControlZebra`
2. Installer runs without UAC on a standard user account
3. Reinstall over the same path succeeds without manual cleanup
4. Uninstall removes app files without elevation

---

## Recurring release checklist

- [ ] Decide `VERSION` and finalize notes
- [ ] Update `build/config.yml` version
- [ ] Run `task common:update:build-assets`
- [ ] Build/package Windows amd64
- [ ] Build/package Windows arm64
- [ ] Generate/refresh self-signed cert (`task windows:cert:selfsigned`)
- [ ] Self-sign Windows executable + installers
- [ ] Verify artifact signatures in self-signed mode
- [ ] Validate installer sizes + SHA256
- [ ] Copy installers into `controlzebra-releases/releases/download/$VERSION/`
- [ ] Update `controlzebra-releases/desktop/beta/update.json`
- [ ] Sign `update.json` and update `update.json.sig`
- [ ] Commit/push `controlzebra-releases`
- [ ] Smoke test updater check

---

## Future tasks (upload automation backlog)

### P0 (next)

1. **One-command publish script**
   - Add script in `ControlZebra-Desktop/scripts/`:
     - builds both Windows installers,
     - computes checksums/sizes,
     - updates `controlzebra-releases/desktop/beta/update.json`,
     - signs manifest,
     - copies artifacts to `releases/download/$VERSION/`.

2. **Validation guardrails**
   - Fail publish if:
     - any URL in `update.json` is missing,
     - checksum format is invalid,
     - signature verification fails.

3. **Dry-run mode**
   - Add `--dry-run` to preview file operations and manifest changes.

### P1

4. **GitHub Release API integration**
   - Auto-create GitHub release tag `vX.Y.Z-beta` and upload installers.
   - Generate `releaseNotes` from changelog fragments.

5. **CI workflow for beta channel**
   - Triggered by tag pattern `v*-beta`.
   - Build both Windows installers.
   - Publish artifacts to `controlzebra-releases`.
   - Sign manifest using GitHub secret key.

6. **Automated smoke test**
   - CI step runs `cz-updater check` against published beta manifest and asserts `available=true` from previous baseline.

### P2

7. **Channel-aware promotion tool**
   - Promote same binaries from beta → stable by regenerating only channel manifest, with optional min-version/mandatory policies.

8. **Release dashboard doc/table**
   - Keep a machine-readable release index (version, date, checksum, URLs, signature status).

---

## Ownership

- Primary owner: Desktop release maintainer
- Secondary owner: Update pipeline maintainer

Update this runbook whenever build/output naming, signing flow, or release repo layout changes.
