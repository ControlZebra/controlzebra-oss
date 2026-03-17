# Build Guide — ControlZebra Desktop

> How to build, package, and distribute ControlZebra for **macOS** and **Windows** (ARM64 & AMD64).

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Project Architecture (Build Perspective)](#project-architecture-build-perspective)
4. [Step-by-Step Build Process](#step-by-step-build-process)
5. [Under the Hood — What Happens During a Build](#under-the-hood--what-happens-during-a-build)
6. [Bundling Git & GitHub CLI](#bundling-git--github-cli)
7. [Cross-Compilation](#cross-compilation)
8. [Code Signing & Notarization](#code-signing--notarization)
9. [Build Matrix Reference](#build-matrix-reference)
10. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# 1. Install prerequisites (macOS)
brew install go node task makensis
go install github.com/wailsapp/wails/v3/cmd/wails3@latest

# 2. Download bundled CLI dependencies (git, gh)
./scripts/download-cli-deps.sh --all

# 3. Build everything (all 4 targets)
./scripts/build-all.sh --version 0.2.0

# 4. Or build a specific target
./scripts/build-all.sh --version 0.2.0 --platforms darwin-arm64

# 5. Or use Task directly for a single platform
APP_VERSION=0.2.0 task darwin:package          # macOS .app for current arch
APP_VERSION=0.2.0 task windows:package         # Windows NSIS installer
```

---

## Prerequisites

### Required Tools

| Tool | Version | Purpose | Install |
|------|---------|---------|---------|
| **Go** | 1.24+ | Backend compilation | [go.dev/dl](https://go.dev/dl/) |
| **Node.js** | 18+ | Frontend build | [nodejs.org](https://nodejs.org) |
| **npm** | 9+ | Package management | Ships with Node.js |
| **Wails v3 CLI** | alpha.54+ | App framework CLI | `go install github.com/wailsapp/wails/v3/cmd/wails3@latest` |
| **Task** | 3.x | Build orchestration | [taskfile.dev](https://taskfile.dev/installation/) |

### Optional Tools

| Tool | Purpose | Install |
|------|---------|---------|
| **NSIS** (makensis) | Windows installer creation | `brew install makensis` (macOS), `apt install nsis` (Linux) |
| **osslsigncode** | Local self-signed Windows artifact signing | `brew install osslsigncode` (macOS), `apt install osslsigncode` (Linux) |
| **Docker** | Cross-compilation with CGO | [docker.com](https://docs.docker.com/get-docker/) |
| **Xcode CLT** | macOS codesigning | `xcode-select --install` |

### Verify Setup

```bash
go version          # go1.24+
node --version      # v18+
wails3 version      # v3.0.0-alpha.54+
task --version      # Task version 3.x
```

---

## Project Architecture (Build Perspective)

```
ControlZebra-Desktop/
├── main.go                           # App entry point (Go)
├── go.mod                            # Go module (controlzebra)
├── Taskfile.yml                      # Root task runner (delegates to platform Taskfiles)
│
├── frontend/
│   ├── package.json                  # React + Vite frontend
│   ├── vite.config.js                # Vite bundler config
│   └── dist/                         # ← Built frontend (embedded into Go binary)
│
├── services/
│   ├── git_service.go                # Git CLI wrapper (2000+ lines)
│   ├── github_service.go             # gh CLI wrapper
│   ├── cli_resolver.go               # Bundled CLI path resolution
│   ├── runner.go                     # CommandRunner (executes CLI tools)
│   └── ...
│
├── build/
│   ├── config.yml                    # Wails project config
│   ├── Taskfile.yml                  # Common build tasks
│   ├── deps/                         # ← Downloaded git/gh CLI deps per platform
│   │   ├── .cache/                   # Downloaded archives (not committed)
│   │   ├── darwin-arm64/{git,gh}/    # macOS ARM64 deps
│   │   ├── darwin-amd64/{git,gh}/    # macOS AMD64 deps
│   │   ├── windows-amd64/{git,gh}/   # Windows AMD64 deps
│   │   └── windows-arm64/{git,gh}/   # Windows ARM64 deps
│   ├── darwin/
│   │   ├── Taskfile.yml              # macOS build tasks
│   │   ├── Info.plist                # App bundle metadata
│   │   └── icons.icns                # macOS icon
│   ├── windows/
│   │   ├── Taskfile.yml              # Windows build tasks
│   │   ├── nsis/project.nsi          # NSIS installer script
│   │   ├── icon.ico                  # Windows icon
│   │   └── wails.exe.manifest        # Windows manifest
│   └── docker/
│       └── Dockerfile.cross          # Docker cross-compilation image
│
├── scripts/
│   ├── build-all.sh                  # Multi-platform build orchestrator
│   ├── download-cli-deps.sh          # Download portable git & gh for bundling
│   └── create-release.sh             # Release manifest generator
│
├── bin/                              # ← Build output
│   ├── control-zebra                 # macOS binary
│   ├── control-zebra.app/            # macOS app bundle
│   ├── control-zebra-windows-amd64.exe
│   └── control-zebra-amd64-installer.exe
│
└── cmd/
    └── updater/                      # cz-updater sidecar binary
```

---

## Step-by-Step Build Process

### Step 1: Download CLI Dependencies

The app bundles portable git and gh CLI binaries so users don't need to install them separately.

```bash
# Download for all platforms
./scripts/download-cli-deps.sh --all

# Or specific platform
./scripts/download-cli-deps.sh --platform windows-amd64

# Override versions
./scripts/download-cli-deps.sh --all --git-version 2.47.1.2 --gh-version 2.65.0
```

**What gets downloaded:**

| Platform | Git | gh CLI |
|----------|-----|--------|
| **darwin-arm64** | System/Homebrew git (copied) | `gh_X.Y.Z_macOS_arm64.zip` from GitHub |
| **darwin-amd64** | System/Homebrew git (copied) | `gh_X.Y.Z_macOS_amd64.zip` from GitHub |
| **windows-amd64** | `MinGit-X.Y.Z-64-bit.zip` from git-for-windows | `gh_X.Y.Z_windows_amd64.zip` from GitHub |
| **windows-arm64** | `MinGit-X.Y.Z-arm64.zip` from git-for-windows | `gh_X.Y.Z_windows_arm64.zip` from GitHub |

> **Note on macOS git:** There is no official portable "MinGit" for macOS. The script copies git from your local Homebrew or Xcode CLT installation. For CI builds, ensure Homebrew git is installed on the build agent.

### Step 2: Build the Frontend

```bash
task common:build:frontend
```

This runs `npm install` → `npm run build` inside `frontend/`, producing the `frontend/dist/` directory containing optimized HTML/JS/CSS.

### Step 3: Generate Wails Bindings

```bash
task common:generate:bindings
```

Scans Go service structs and generates TypeScript bindings in `frontend/bindings/` that let the React frontend call Go methods.

### Step 4: Compile Go Binary

```bash
# macOS (current arch)
task darwin:build

# macOS (specific arch)
task darwin:build ARCH=arm64
task darwin:build ARCH=amd64

# macOS universal (fat binary)
task darwin:build:universal

# Windows (cross-compile from macOS — no CGO)
task windows:build ARCH=amd64
task windows:build ARCH=arm64
```

### Step 5: Build the Updater Sidecar

```bash
# For current platform
task build:updater

# Cross-compile for specific target
task build:updater:cross TARGET_OS=windows TARGET_ARCH=amd64
task build:updater:cross TARGET_OS=darwin TARGET_ARCH=arm64
```

### Step 6: Package

```bash
# macOS: create .app bundle (includes bundled git/gh from build/deps/)
task darwin:package

# macOS: universal .app bundle
task darwin:package:universal

# Windows: create NSIS installer (includes bundled MinGit/gh)
task windows:package
```

### All-in-One

```bash
# Build and package everything for all platforms
./scripts/build-all.sh --version 0.2.0

# With options
./scripts/build-all.sh \
  --version 0.2.0 \
  --platforms darwin-arm64,darwin-amd64,windows-amd64,windows-arm64 \
  --universal
```

---

## Under the Hood — What Happens During a Build

### Phase 1: Frontend Bundle (Vite)

```
frontend/src/**/*.{jsx,tsx,css}
        │
        ▼  Vite (vite build)
        │
frontend/dist/
    ├── index.html          # Entry point
    ├── assets/
    │   ├── index-abc123.js # React app (tree-shaken, minified)
    │   └── index-def456.css# Tailwind + MUI styles
    └── ...
```

Vite reads `vite.config.js`, processes JSX/TSX with esbuild, tree-shakes unused code, and outputs optimized static assets. The production build strips development warnings and minifies everything.

### Phase 2: Go Embed + Compilation

```
main.go:  //go:embed all:frontend/dist
              │
              ▼  go build
              │
         Single binary containing:
         ├── Go runtime
         ├── Wails v3 webview runtime
         ├── All service code (git_service, github_service, etc.)
         ├── Embedded frontend/dist/** (via embed.FS)
         └── Platform-specific webview bindings
```

Go's `embed` package reads the `frontend/dist/` directory **at compile time** and embeds every file as a byte slice inside the binary. At runtime, Wails serves these files to the native webview via an internal HTTP server — no external file access needed.

**Key build flags:**

```bash
# Production build (from build/darwin/Taskfile.yml)
go build \
  -tags production \              # Enables production-only code paths
  -trimpath \                     # Strips local file paths from binary
  -buildvcs=false \               # Don't embed git info (we use ldflags)
  -ldflags="-w -s -X main.Version=0.2.0"  # Strip debug info, inject version
```

| Flag | Purpose |
|------|---------|
| `-tags production` | Activates Wails production asset serving (embedded FS vs dev server) |
| `-trimpath` | Removes local filesystem paths from the binary (security + reproducibility) |
| `-w -s` | Strip DWARF debug info and symbol table (reduces binary size ~30%) |
| `-X main.Version=...` | Injects version string at link time |
| `-H windowsgui` | (Windows only) Hides console window |

### Phase 3: Platform-Specific Packaging

#### macOS → `.app` Bundle

```
control-zebra.app/
├── Contents/
│   ├── Info.plist              # Bundle metadata (version, identifier, icon)
│   ├── MacOS/
│   │   ├── control-zebra       # Main binary
│   │   └── cz-updater          # Auto-update sidecar
│   └── Resources/
│       ├── icons.icns           # App icon
│       ├── git/                 # ← Bundled portable git
│       │   ├── bin/git
│       │   ├── bin/git-lfs
│       │   └── libexec/git-core/
│       └── gh/                  # ← Bundled gh CLI
│           └── bin/gh
```

The `.app` bundle is a standard macOS application directory. macOS expects this structure to display the app properly (icon, name, sandboxing metadata). The binary inside `MacOS/` is what actually runs; everything in `Resources/` is auxiliary.

**Codesigning:** Even for local development, macOS requires ad-hoc signing (`codesign --force --deep --sign -`) to run the app without Gatekeeper warnings. For distribution, you need a Developer ID certificate.

#### Windows → NSIS Installer

```
NSIS Installer (control-zebra-amd64-installer.exe)
    │
    ▼ When user runs installer:
    │
    C:\Program Files\ControlZebra\ControlZebra\
    ├── control-zebra.exe        # Main binary
    ├── cz-updater.exe           # Auto-update sidecar
    ├── git\                     # ← MinGit portable
    │   ├── cmd\git.exe
    │   ├── mingw64\
    │   └── ...
    └── gh\                      # ← GitHub CLI
        └── gh.exe
```

NSIS (Nullsoft Scriptable Install System) compiles `project.nsi` into a self-extracting installer. The script handles:
- Architecture detection (AMD64 vs ARM64)
- WebView2 runtime bootstrapping (required for Wails)
- File installation with proper permissions
- Start menu and desktop shortcut creation
- Registry entries for Add/Remove Programs
- Uninstaller generation

### Phase 4: CLI Resolution at Runtime

The app needs `git` and `gh` CLI tools to function. At startup, `cli_resolver.go` resolves paths:

```
1. Check bundled path (relative to executable):
   macOS:   Contents/Resources/git/bin/git
   Windows: <install dir>\git\cmd\git.exe

2. If not found → exec.LookPath("git") (system PATH)

3. If not found → bare "git" string (exec.Command does final lookup)
```

This is handled by `services/cli_resolver.go` and used by `services/runner.go`. The `CommandRunner.RunGit()` method calls `GitPath()` which returns the resolved absolute path. Same for `GhPath()` and all gh CLI calls.

---

## Bundling Git & GitHub CLI

### Why Bundle?

ControlZebra targets **non-technical industrial automation users** who may not have git or gh installed. Bundling ensures the app works out of the box.

### What Gets Bundled

| Platform | Git | gh | Total Overhead |
|----------|-----|----|----------------|
| Windows | MinGit portable (~45 MB) | gh CLI (~15 MB) | ~60 MB |
| macOS | Homebrew/system git (~25 MB) | gh CLI (~20 MB) | ~45 MB |

### Updating Bundled Versions

Edit version pins in `scripts/download-cli-deps.sh`:

```bash
GIT_WIN_VERSION="2.47.1.2"     # MinGit for Windows
GH_VERSION="2.65.0"            # GitHub CLI (all platforms)
```

Then re-run:

```bash
./scripts/download-cli-deps.sh --all --clean
```

### Runtime Resolution Order

See `services/cli_resolver.go`:

1. **Bundled** — relative to executable (fastest, most reliable)
2. **System PATH** — `exec.LookPath("git")` / `exec.LookPath("gh")`
3. **Bare name** — fallback to `exec.Command("git", ...)` which does its own lookup

The resolution runs once on first use and is cached via `sync.Once`.

---

## Cross-Compilation

### From macOS (Recommended Build Host)

| Target | Method | CGO | Notes |
|--------|--------|-----|-------|
| **macOS arm64** | Native `go build` | Enabled | Native on Apple Silicon |
| **macOS amd64** | Native cross-compile | Enabled | Uses `GOARCH=amd64` |
| **macOS universal** | `lipo` merge | — | Combines arm64 + amd64 binaries |
| **Windows amd64** | Go cross-compile | Disabled | `GOOS=windows GOARCH=amd64 CGO_ENABLED=0` |
| **Windows arm64** | Go cross-compile | Disabled | `GOOS=windows GOARCH=arm64 CGO_ENABLED=0` |
| **Windows (CGO)** | Docker + Zig CC | Enabled | Uses `build/docker/Dockerfile.cross` |

### Docker Cross-Compilation (for CGO builds)

Some features may require CGO (e.g., SQLite, native dialogs on certain platforms). The Docker image uses **Zig** as a C cross-compiler with a macOS SDK:

```bash
# Build the Docker image (one-time, ~800 MB download)
task setup:docker

# Build for Windows with CGO via Docker
task windows:build CGO_ENABLED=1

# Build for macOS from a Linux CI runner
task darwin:build
```

The Docker image (`build/docker/Dockerfile.cross`) contains:
- Go 1.26
- Zig 0.14 (C/C++ cross-compiler)
- macOS SDK 14.5 (for darwin targets)
- Pre-configured compiler wrappers for each target triple

### Why Zig?

Zig can compile C code for any target (including macOS from Linux and Windows from macOS) without needing a full toolchain for each platform. It replaces the need for separate cross-compilers like `x86_64-w64-mingw32-gcc` or `osxcross`.

---

## Code Signing & Notarization

### macOS

```bash
# 1. Configure signing identity in build/darwin/Taskfile.yml:
#    SIGN_IDENTITY: "Developer ID Application: Your Company (TEAMID)"
#    KEYCHAIN_PROFILE: "my-notarize-profile"

# 2. Store notarization credentials (one-time)
wails3 signing credentials \
  --apple-id "you@email.com" \
  --team-id "TEAMID" \
  --password "app-specific-password" \
  --profile "my-notarize-profile"

# 3. Sign the app
task darwin:sign

# 4. Sign + notarize (for distribution)
task darwin:sign:notarize
```

### Windows

```bash
# Option A (recommended for beta/internal): local self-signed signing
# 1) One-time: generate local cert bundle
task windows:cert:selfsigned

# 2) Sign artifacts in self-signed mode
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra-windows-amd64.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra-amd64-installer.exe

# 3) Verify signatures (self-signed aware)
CZ_WINDOWS_SELF_SIGNED=true task windows:verify:artifact INPUT=bin/control-zebra-windows-amd64.exe
CZ_WINDOWS_SELF_SIGNED=true task windows:verify:artifact INPUT=bin/control-zebra-amd64-installer.exe

# Option B (CA-issued cert):
# Configure SIGN_CERTIFICATE or SIGN_THUMBPRINT and use:
task windows:sign
task windows:sign:installer
```

#### Self-signed workflow notes

- Cert artifacts are generated under `build/certs/windows/selfsigned/` and are gitignored.
- The workflow generates/uses:
  - `controlzebra-selfsigned.pfx`
  - `controlzebra-selfsigned.cer`
  - `password.txt`
- Self-signed mode is intended for **beta/internal** distribution and consistency, not SmartScreen trust.
- In multi-platform builds, pass `--sign` and export `CZ_WINDOWS_SELF_SIGNED=true` to sign Windows artifacts during packaging.

---

## Build Matrix Reference

### Available Task Commands

| Command | Description |
|---------|-------------|
| `task dev` | Development mode with hot reload |
| `task build` | Build for current OS (auto-detect) |
| `task package` | Package for current OS |
| `task darwin:build` | Build macOS binary |
| `task darwin:build ARCH=amd64` | Build macOS AMD64 binary |
| `task darwin:build:universal` | Build macOS universal binary |
| `task darwin:package` | Create macOS `.app` bundle |
| `task darwin:package:universal` | Universal `.app` bundle |
| `task darwin:sign` | Sign `.app` with Developer ID |
| `task darwin:sign:notarize` | Sign + notarize `.app` |
| `task windows:build` | Build Windows binary |
| `task windows:build ARCH=arm64` | Build Windows ARM64 binary |
| `task windows:package` | Create NSIS installer |
| `task windows:package FORMAT=msix` | Create MSIX package |
| `task windows:cert:selfsigned` | Generate/refresh local self-signed Windows code-signing cert |
| `task windows:sign:artifact INPUT=...` | Sign one Windows artifact (`.exe`) |
| `task windows:verify:artifact INPUT=...` | Verify one signed Windows artifact |
| `task windows:sign:release ARCH=amd64` | Sign binary + installer for an architecture |
| `task windows:verify:release ARCH=amd64` | Verify binary + installer for an architecture |
| `task build:updater` | Build updater sidecar |
| `task build:updater:cross TARGET_OS=windows TARGET_ARCH=amd64` | Cross-compile updater |
| `task setup:docker` | Build Docker cross-compilation image |

### Build Scripts

| Script | Description |
|--------|-------------|
| `./scripts/download-cli-deps.sh --all` | Download git/gh for all platforms |
| `./scripts/build-all.sh --version X.Y.Z` | Full multi-platform build |
| `./scripts/create-release.sh --version X.Y.Z` | Generate release manifests |

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `APP_VERSION` | `0.0.0-dev` | Version injected into binary via `-ldflags` |
| `SIGNING_PUBLIC_KEY` | `""` | Ed25519 public key for update manifest verification |
| `CZ_SIGNING_KEY` | `""` | Ed25519 private key for manifest signing |
| `CZ_WINDOWS_SELF_SIGNED` | `false` | Enable self-signed Windows artifact signing/verification mode |
| `CZ_WINDOWS_SELF_SIGNED_CERT_DIR` | `build/certs/windows/selfsigned` | Directory for local self-signed PFX/CER/password |
| `CZ_WINDOWS_TIMESTAMP_SERVER` | `http://timestamp.digicert.com` | Timestamp server used during Windows signing |
| `CZ_WINDOWS_SIGN_CERTIFICATE` | `""` | Path to CA-issued signing certificate (PFX) |
| `CZ_WINDOWS_SIGN_THUMBPRINT` | `""` | Thumbprint for certificate in local store |

---

## Troubleshooting

### "wails3: command not found"

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
# Ensure $GOPATH/bin is in your PATH
export PATH="$PATH:$(go env GOPATH)/bin"
```

### Windows build fails with "CGO_ENABLED" errors

Windows builds from macOS default to `CGO_ENABLED=0` (pure Go). If a dependency requires CGO:

```bash
# Option 1: Use Docker
task setup:docker
task windows:build CGO_ENABLED=1

# Option 2: Install mingw-w64
brew install mingw-w64
CC=x86_64-w64-mingw32-gcc CGO_ENABLED=1 task windows:build
```

### macOS .app won't open ("damaged" or "unidentified developer")

```bash
# Ad-hoc sign for local testing
codesign --force --deep --sign - bin/control-zebra.app

# Or remove quarantine attribute
xattr -cr bin/control-zebra.app
```

### NSIS installer missing WebView2

The NSIS script automatically downloads the WebView2 bootstrapper. If the build machine has no internet:

```bash
# Pre-download the bootstrapper
wails3 generate webview2bootstrapper -dir build/windows/nsis/
```

### "osslsigncode is required for local self-signed signing"

```bash
# macOS
brew install osslsigncode

# Linux
sudo apt install osslsigncode
```

Then rerun:

```bash
task windows:cert:selfsigned
CZ_WINDOWS_SELF_SIGNED=true task windows:sign:artifact INPUT=bin/control-zebra-windows-amd64.exe
```

### Bundled git not found at runtime

Check the app bundle structure:

```bash
# macOS
ls -la bin/control-zebra.app/Contents/Resources/git/bin/

# Windows (after installing)
dir "C:\Program Files\ControlZebra\ControlZebra\git\cmd\"
```

If empty, re-run CLI dep download:

```bash
./scripts/download-cli-deps.sh --all --clean
```

### Docker build image issues

```bash
# Rebuild from scratch
docker rmi wails-cross
task setup:docker

# Check image size (~800 MB expected)
docker images wails-cross
```

---

## CI/CD Build Pipeline (Reference)

For GitHub Actions, a typical workflow would:

```yaml
# .github/workflows/build.yml (example)
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-14       # ARM64 runner
            platform: darwin-arm64
          - os: macos-13       # AMD64 runner
            platform: darwin-amd64
          - os: ubuntu-latest  # Cross-compile Windows
            platform: windows-amd64
          - os: ubuntu-latest
            platform: windows-arm64
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.24' }
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: go install github.com/wailsapp/wails/v3/cmd/wails3@latest
      - run: npm install -g task
      - run: ./scripts/download-cli-deps.sh --platform ${{ matrix.platform }}
      - run: ./scripts/build-all.sh --version ${{ github.ref_name }} --platforms ${{ matrix.platform }}
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.platform }}
          path: bin/
```

---

*Last updated: February 2026*
