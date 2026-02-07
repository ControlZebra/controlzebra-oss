#!/usr/bin/env bash
#
# create-release.sh — Generate update manifest and prepare release artifacts
#
# Phase 6 of the ControlZebra auto-update plan. This script generates the
# update.json manifest that the cz-updater sidecar fetches from the update
# server to determine if a new version is available.
#
# Prerequisites:
#   - Build platform binaries first (see examples below)
#   - python3 (for JSON generation — available on macOS/Linux)
#   - gh CLI (optional, only for --upload)
#
# Usage:
#   ./scripts/create-release.sh --version <semver> [options]
#
# Required:
#   --version, -v     Release version (e.g., 0.1.0)
#
# Options:
#   --notes, -n       Release notes (text, or @filepath to read from file)
#   --dir, -d         Directory containing platform binaries (default: bin/)
#   --output, -o      Output directory (default: release/<version>/)
#   --repo, -r        GitHub repo for release URLs (default: ControlZebra/controlzebra-releases)
#   --channel, -c     Release channel: stable or beta (default: stable)
#   --beta            Shortcut for --channel beta
#   --upload          Create GitHub Release and upload artifacts via gh CLI
#   --min-version     Minimum app version that can auto-update to this release
#   --mandatory       Mark this update as mandatory
#   --sign            Sign the manifest with Ed25519 (requires CZ_SIGNING_KEY env var or --signing-key)
#   --signing-key     Base64-encoded Ed25519 private key for manifest signing
#
# Expected binary naming in --dir:
#   control-zebra-<os>-<arch>[.exe]
#
# Supported platforms:
#   darwin-arm64, darwin-amd64, windows-amd64, linux-amd64, linux-arm64
#
# Examples:
#   # Build, then generate manifest for current platform only (quick test):
#   task darwin:build
#   ./scripts/create-release.sh -v 0.1.0 -n "First release"
#
#   # Build all platforms, then generate full manifest:
#   APP_VERSION=0.1.0 task darwin:build
#   cp bin/control-zebra bin/control-zebra-darwin-arm64
#   APP_VERSION=0.1.0 task windows:build
#   cp bin/control-zebra.exe bin/control-zebra-windows-amd64.exe
#   ./scripts/create-release.sh -v 0.1.0 -n "First release"
#
#   # Generate and upload to GitHub in one step:
#   ./scripts/create-release.sh -v 0.1.0 -n @CHANGELOG.md --upload
#
# Output structure:
#   release/0.1.0/
#     update.json                              ← manifest for update server
#     control-zebra-0.1.0-darwin-arm64         ← versioned binary
#     control-zebra-0.1.0-windows-amd64.exe    ← versioned binary
#     checksums.txt                            ← SHA-256 checksums
#
set -euo pipefail

# ─── Configuration ─────────────────────────────────────────────────────────────

APP_NAME="control-zebra"
DEFAULT_REPO="ControlZebra/controlzebra-releases"

# ─── Color output ──────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${BLUE}ℹ${NC}  $*"; }
ok()    { echo -e "${GREEN}✓${NC}  $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
err()   { echo -e "${RED}✗${NC}  $*" >&2; }
die()   { err "$@"; exit 1; }

# ─── Argument Parsing ──────────────────────────────────────────────────────────

VERSION=""
RELEASE_NOTES=""
BINARIES_DIR="bin"
OUTPUT_DIR=""
REPO="$DEFAULT_REPO"
CHANNEL="stable"
DO_UPLOAD=false
MIN_VERSION=""
MANDATORY=false
DO_SIGN=false
SIGNING_KEY=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version|-v)   VERSION="$2"; shift 2 ;;
        --notes|-n)     RELEASE_NOTES="$2"; shift 2 ;;
        --dir|-d)       BINARIES_DIR="$2"; shift 2 ;;
        --output|-o)    OUTPUT_DIR="$2"; shift 2 ;;
        --repo|-r)      REPO="$2"; shift 2 ;;
        --channel|-c)   CHANNEL="$2"; shift 2 ;;
        --beta)         CHANNEL="beta"; shift ;;
        --upload)       DO_UPLOAD=true; shift ;;
        --min-version)  MIN_VERSION="$2"; shift 2 ;;
        --mandatory)    MANDATORY=true; shift ;;
        --sign)         DO_SIGN=true; shift ;;
        --signing-key)  SIGNING_KEY="$2"; DO_SIGN=true; shift 2 ;;
        --help|-h)
            sed -n '2,/^set -euo/{ /^set -euo/d; s/^# \{0,1\}//p; }' "$0"
            exit 0
            ;;
        *) die "Unknown option: $1 (use --help for usage)" ;;
    esac
done

# ─── Validation ────────────────────────────────────────────────────────────────

if [[ -z "$VERSION" ]]; then
    die "--version is required. Usage: $0 --version 0.1.0"
fi

# Validate semver format (X.Y.Z or X.Y.Z-prerelease)
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$'; then
    die "Invalid version format: $VERSION (expected semver like 0.1.0 or 0.1.0-beta.1)"
fi

if [[ ! -d "$BINARIES_DIR" ]]; then
    die "Binaries directory not found: $BINARIES_DIR"
fi

if [[ "$CHANNEL" != "stable" && "$CHANNEL" != "beta" ]]; then
    die "Invalid --channel value: $CHANNEL (expected 'stable' or 'beta')"
fi

# python3 is required for JSON generation
if ! command -v python3 &>/dev/null; then
    die "python3 is required (used for JSON generation)"
fi

# Resolve release notes from @file reference
if [[ -n "$RELEASE_NOTES" ]] && [[ "${RELEASE_NOTES:0:1}" == "@" ]]; then
    notes_file="${RELEASE_NOTES:1}"
    if [[ ! -f "$notes_file" ]]; then
        die "Release notes file not found: $notes_file"
    fi
    RELEASE_NOTES=$(cat "$notes_file")
fi

# Default release notes if none provided
if [[ -z "$RELEASE_NOTES" ]]; then
    RELEASE_NOTES="ControlZebra v${VERSION}"
fi

# Default output directory
OUTPUT_DIR="${OUTPUT_DIR:-release/$VERSION}"

# ─── Detect Platform Binaries ─────────────────────────────────────────────────

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
padding=$(printf '%*s' $((19 - ${#VERSION})) '')
echo -e "${BOLD}║  ControlZebra Release Builder — v${VERSION}${padding}║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

info "Scanning for platform binaries in ${BOLD}$BINARIES_DIR/${NC}..."

# Parallel arrays to store found binaries (bash 3.x compatible — no associative arrays)
FOUND_PLATFORMS=()
FOUND_PATHS=()

# Check each supported platform
for platform in darwin-arm64 darwin-amd64 windows-amd64 linux-amd64 linux-arm64; do
    os_part="${platform%-*}"
    arch_part="${platform#*-}"

    found=""

    # Try different naming patterns
    for candidate in \
        "$BINARIES_DIR/$APP_NAME-$platform" \
        "$BINARIES_DIR/$APP_NAME-${os_part}-${arch_part}" \
        ; do
        if [[ -f "$candidate" ]]; then
            found="$candidate"
            break
        fi
    done

    # Windows: also check .exe variants
    if [[ -z "$found" ]] && [[ "$os_part" == "windows" ]]; then
        for candidate in \
            "$BINARIES_DIR/$APP_NAME-$platform.exe" \
            "$BINARIES_DIR/$APP_NAME-${os_part}-${arch_part}.exe" \
            ; do
            if [[ -f "$candidate" ]]; then
                found="$candidate"
                break
            fi
        done
    fi

    if [[ -n "$found" ]]; then
        FOUND_PLATFORMS+=("$platform")
        FOUND_PATHS+=("$found")
        ok "Found ${BOLD}$platform${NC} → $found"
    fi
done

# Fallback: if no platform-specific binaries found, detect the current platform
# and use the default binary name (bin/control-zebra or bin/control-zebra.exe)
if [[ ${#FOUND_PLATFORMS[@]} -eq 0 ]]; then
    current_os=$(uname -s | tr '[:upper:]' '[:lower:]')
    if [[ "$current_os" != "darwin" ]] && [[ "$current_os" != "linux" ]]; then
        current_os="windows"
    fi

    current_arch=$(uname -m)
    case "$current_arch" in
        x86_64)                current_arch="amd64" ;;
        aarch64|arm64)         current_arch="arm64" ;;
    esac

    current_platform="$current_os-$current_arch"

    fallback="$BINARIES_DIR/$APP_NAME"
    if [[ "$current_os" == "windows" ]]; then
        fallback="$BINARIES_DIR/$APP_NAME.exe"
    fi

    if [[ -f "$fallback" ]]; then
        FOUND_PLATFORMS+=("$current_platform")
        FOUND_PATHS+=("$fallback")
        warn "No platform-specific binaries found."
        warn "Using ${BOLD}$fallback${NC} as ${BOLD}$current_platform${NC} (single-platform release)"
    fi
fi

if [[ ${#FOUND_PLATFORMS[@]} -eq 0 ]]; then
    die "No binaries found in $BINARIES_DIR/. Build first, then try again."
fi

echo ""
info "Found ${BOLD}${#FOUND_PLATFORMS[@]}${NC} platform(s)"
echo ""

# ─── Compute Checksums and Copy Versioned Binaries ─────────────────────────────

info "Computing checksums and staging release artifacts..."
echo ""

mkdir -p "$OUTPUT_DIR"

# Write platform data to a temp file (one record per line, pipe-delimited)
# Format: platform|download_url|size_bytes|sha256_hex
RECORDS_TMPFILE=$(mktemp)
CHECKSUMS_FILE="$OUTPUT_DIR/checksums.txt"
> "$CHECKSUMS_FILE"

# Track output filenames for the --upload step
UPLOAD_FILES=()

i=0
while [[ $i -lt ${#FOUND_PLATFORMS[@]} ]]; do
    platform="${FOUND_PLATFORMS[$i]}"
    src="${FOUND_PATHS[$i]}"
    os_part="${platform%-*}"

    # Determine versioned output filename
    ext=""
    if [[ "$os_part" == "windows" ]]; then
        ext=".exe"
    fi
    dest_name="$APP_NAME-$VERSION-$platform$ext"
    dest="$OUTPUT_DIR/$dest_name"

    # Copy binary to output with versioned name
    cp "$src" "$dest"

    # Compute SHA-256
    if command -v sha256sum &>/dev/null; then
        checksum=$(sha256sum "$dest" | awk '{print $1}')
    else
        checksum=$(shasum -a 256 "$dest" | awk '{print $1}')
    fi

    # Get file size in bytes
    if [[ "$(uname)" == "Darwin" ]]; then
        size=$(stat -f%z "$dest")
    else
        size=$(stat -c%s "$dest")
    fi

    # Construct the download URL (GitHub Releases asset URL)
    download_url="https://github.com/$REPO/releases/download/v$VERSION/$dest_name"

    # Human-readable size
    size_mb=$(echo "scale=1; $size / 1048576" | bc 2>/dev/null || echo "?")

    ok "$platform: ${BOLD}$dest_name${NC} (${size_mb} MB, sha256:${checksum:0:16}…)"

    # Write to records file for Python to parse
    echo "$platform|$download_url|$size|$checksum" >> "$RECORDS_TMPFILE"

    # Write to checksums file (standard sha256sum format)
    echo "$checksum  $dest_name" >> "$CHECKSUMS_FILE"

    # Track for upload
    UPLOAD_FILES+=("$dest")

    i=$((i + 1))
done

echo ""

# ─── Generate update.json Manifest ────────────────────────────────────────────

info "Generating ${BOLD}update.json${NC} manifest..."

# Write release notes to a temp file to avoid shell escaping issues in heredocs
NOTES_TMPFILE=$(mktemp)
printf '%s' "$RELEASE_NOTES" > "$NOTES_TMPFILE"

# Resolve mandatory flag to Python boolean string
MANDATORY_PY="False"
if $MANDATORY; then
    MANDATORY_PY="True"
fi

RELEASE_DATE=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Use Python for reliable, correctly-escaped JSON generation
python3 - "$RECORDS_TMPFILE" "$NOTES_TMPFILE" "$VERSION" "$RELEASE_DATE" "$MIN_VERSION" "$MANDATORY_PY" "$OUTPUT_DIR/update.json" << 'PYEOF'
import json
import sys

records_file = sys.argv[1]
notes_file = sys.argv[2]
version = sys.argv[3]
release_date = sys.argv[4]
min_version = sys.argv[5]
mandatory_str = sys.argv[6]
output_file = sys.argv[7]

# Parse platform records
platforms = {}
with open(records_file) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        parts = line.split("|")
        key, url, size, checksum_hex = parts[0], parts[1], int(parts[2]), parts[3]
        platforms[key] = {
            "url": url,
            "size": size,
            "checksum": f"sha256:{checksum_hex}",
        }

# Read release notes
with open(notes_file) as f:
    notes = f.read().strip()

# Build manifest
manifest = {
    "version": version,
    "releaseDate": release_date,
    "releaseNotes": notes,
    "platforms": platforms,
}

if min_version:
    manifest["minimumVersion"] = min_version

if mandatory_str == "True":
    manifest["mandatory"] = True

# Write manifest
with open(output_file, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
PYEOF

# Clean up temp files
rm -f "$RECORDS_TMPFILE" "$NOTES_TMPFILE"

ok "Manifest written to ${BOLD}$OUTPUT_DIR/update.json${NC}"
echo ""

# ─── Sign Manifest (optional) ─────────────────────────────────────────────────

if $DO_SIGN; then
    # Resolve signing key: --signing-key flag > CZ_SIGNING_KEY env var
    if [[ -z "$SIGNING_KEY" ]]; then
        SIGNING_KEY="${CZ_SIGNING_KEY:-}"
    fi

    if [[ -z "$SIGNING_KEY" ]]; then
        die "Signing requested but no key provided. Set CZ_SIGNING_KEY env var or use --signing-key <base64>"
    fi

    info "Signing manifest with Ed25519..."

    # Use the Go signing tool
    if go run scripts/signing/main.go sign \
        --key "$SIGNING_KEY" \
        --file "$OUTPUT_DIR/update.json" \
        --output "$OUTPUT_DIR/update.json.sig"; then
        ok "Manifest signed → ${BOLD}$OUTPUT_DIR/update.json.sig${NC}"
    else
        die "Manifest signing failed!"
    fi

    echo ""
fi

# ─── Summary ───────────────────────────────────────────────────────────────────

echo -e "${BOLD}═══ Release v$VERSION artifacts ═══${NC}"
echo ""
ls -lh "$OUTPUT_DIR/"
echo ""

# Verify the manifest is valid JSON
if python3 -c "import json; json.load(open('$OUTPUT_DIR/update.json'))" 2>/dev/null; then
    ok "Manifest JSON validated"
else
    err "Manifest JSON validation failed!"
fi

# Show manifest contents
echo ""
echo -e "${BOLD}═══ update.json ═══${NC}"
python3 -m json.tool "$OUTPUT_DIR/update.json" 2>/dev/null || cat "$OUTPUT_DIR/update.json"
echo -e "${BOLD}════════════════════${NC}"
echo ""

# ─── Upload to GitHub (optional) ──────────────────────────────────────────────

if $DO_UPLOAD; then
    info "Creating GitHub Release ${BOLD}v$VERSION${NC} on ${BOLD}$REPO${NC}..."
    echo ""

    if ! command -v gh &>/dev/null; then
        die "gh CLI not found. Install it: https://cli.github.com/"
    fi

    if [[ ${#UPLOAD_FILES[@]} -eq 0 ]]; then
        die "No binary files found to upload"
    fi

    # Write release notes to a temp file for gh CLI
    GH_NOTES_FILE=$(mktemp)
    printf '%s' "$RELEASE_NOTES" > "$GH_NOTES_FILE"

    gh release create "v$VERSION" \
        --repo "$REPO" \
        --title "ControlZebra v$VERSION" \
        --notes-file "$GH_NOTES_FILE" \
        "${UPLOAD_FILES[@]}"

    rm -f "$GH_NOTES_FILE"

    ok "GitHub Release created!"
    echo ""
    echo "  https://github.com/$REPO/releases/tag/v$VERSION"
    echo ""
    warn "Next: push update.json to the releases repo for GitHub Pages:"
    echo ""
    echo "  cp $OUTPUT_DIR/update.json <releases-repo-clone>/desktop/$CHANNEL/update.json"
    echo "  cd <releases-repo-clone>"
    echo "  git add desktop/$CHANNEL/update.json"
    echo "  git commit -m 'Update manifest for v$VERSION'"
    echo "  git push"
    echo ""

else
    echo -e "${BOLD}Next steps:${NC}"
    echo ""
    echo "  1. Create a GitHub Release and upload the binaries:"
    echo ""
    echo "     gh release create v$VERSION \\"
    echo "       --repo $REPO \\"
    echo "       --title 'ControlZebra v$VERSION' \\"
    i=0
    while [[ $i -lt ${#FOUND_PLATFORMS[@]} ]]; do
        platform="${FOUND_PLATFORMS[$i]}"
        os_part="${platform%-*}"
        ext=""
        if [[ "$os_part" == "windows" ]]; then ext=".exe"; fi
        echo "       $OUTPUT_DIR/$APP_NAME-$VERSION-$platform$ext \\"
        i=$((i + 1))
    done
    echo "       --notes-file CHANGELOG.md"
    echo ""
    echo "  2. Push update.json to the releases repo (serves via GitHub Pages):"
    echo ""
    echo "     cp $OUTPUT_DIR/update.json <releases-repo>/desktop/$CHANNEL/update.json"
    echo "     cd <releases-repo>"
    echo "     git add desktop/$CHANNEL/update.json"
    echo "     git commit -m 'v$VERSION'"
    echo "     git push"
    echo ""
    echo "  3. Verify the manifest is accessible:"
    echo ""
    echo "     curl -s https://releases.controlzebra.com/desktop/stable/update.json | python3 -m json.tool"
    echo ""
fi
