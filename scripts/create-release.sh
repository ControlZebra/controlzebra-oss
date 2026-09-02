#!/usr/bin/env bash
#
# create-release.sh — Stage Wails updater assets and optionally publish a release
#
# Wails' GitHub updater reads the latest non-prerelease GitHub Release directly.
# A release therefore needs platform-qualified application binaries and a
# sha256sum-style checksum asset named exactly SHA256SUMS. Installers may be
# published beside those files, but are not updater payloads.
#
# Usage:
#   ./scripts/create-release.sh --version <semver> [options]
#
# Required:
#   --version, -v     Release version (for example, 0.3.1)
#
# Options:
#   --notes, -n       Release notes (text, or @filepath to read from a file)
#   --dir, -d         Directory containing build artifacts (default: bin/)
#   --output, -o      Staging directory (default: release/<version>/)
#   --repo, -r        GitHub repository (default: ControlZebra/controlzebra-releases)
#   --upload          Create the GitHub Release and upload staged artifacts
#
# Expected update-payload names in --dir:
#   control-zebra-<os>-<arch>[.exe]
#
# Optional installer names in --dir:
#   control-zebra-<arch>-installer.exe
#   control-zebra-windows-<arch>-installer.exe
#
# Output example:
#   release/0.3.1/
#     control-zebra-0.3.1-windows-amd64.exe
#     control-zebra-amd64-installer.exe
#     SHA256SUMS
#
set -euo pipefail

APP_NAME="control-zebra"
DEFAULT_REPO="ControlZebra/controlzebra-releases"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

info() { echo -e "${BLUE}ℹ${NC}  $*"; }
ok() { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err() { echo -e "${RED}✗${NC}  $*" >&2; }
die() { err "$@"; exit 1; }

VERSION=""
RELEASE_NOTES=""
BINARIES_DIR="bin"
OUTPUT_DIR=""
REPO="$DEFAULT_REPO"
DO_UPLOAD=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --version|-v) VERSION="${2:-}"; shift 2 ;;
        --notes|-n) RELEASE_NOTES="${2:-}"; shift 2 ;;
        --dir|-d) BINARIES_DIR="${2:-}"; shift 2 ;;
        --output|-o) OUTPUT_DIR="${2:-}"; shift 2 ;;
        --repo|-r) REPO="${2:-}"; shift 2 ;;
        --upload) DO_UPLOAD=true; shift ;;
        --help|-h)
            sed -n '2,/^set -euo/{ /^set -euo/d; s/^# \{0,1\}//p; }' "$0"
            exit 0
            ;;
        *) die "Unknown option: $1 (use --help for usage)" ;;
    esac
done

if [[ -z "$VERSION" ]]; then
    die "--version is required. Usage: $0 --version 0.3.1"
fi
if ! echo "$VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
    die "Invalid version format: $VERSION (expected semver such as 0.3.1 or 0.4.0-beta.1)"
fi
if [[ ! -d "$BINARIES_DIR" ]]; then
    die "Build-artifact directory not found: $BINARIES_DIR"
fi
if [[ "$REPO" != */* ]]; then
    die "Invalid GitHub repository: $REPO (expected owner/repository)"
fi

if [[ -n "$RELEASE_NOTES" && "${RELEASE_NOTES:0:1}" == "@" ]]; then
    notes_file="${RELEASE_NOTES:1}"
    [[ -f "$notes_file" ]] || die "Release notes file not found: $notes_file"
    RELEASE_NOTES=$(<"$notes_file")
fi
RELEASE_NOTES="${RELEASE_NOTES:-ControlZebra v$VERSION}"
OUTPUT_DIR="${OUTPUT_DIR:-release/$VERSION}"

echo ""
echo -e "${BOLD}ControlZebra Wails updater release — v${VERSION}${NC}"
echo ""
info "Scanning ${BOLD}$BINARIES_DIR/${NC} for updater payloads"

FOUND_PLATFORMS=()
FOUND_PATHS=()

for platform in darwin-arm64 darwin-amd64 windows-amd64 windows-arm64 linux-amd64 linux-arm64; do
    found=""
    for candidate in \
        "$BINARIES_DIR/$APP_NAME-$platform" \
        "$BINARIES_DIR/$APP_NAME-$platform.exe"; do
        if [[ -f "$candidate" ]]; then
            found="$candidate"
            break
        fi
    done
    if [[ -n "$found" ]]; then
        FOUND_PLATFORMS+=("$platform")
        FOUND_PATHS+=("$found")
        ok "Found $platform payload: $found"
    fi
done

# A default build name is useful for staging a one-platform test release.
if [[ ${#FOUND_PLATFORMS[@]} -eq 0 ]]; then
    host_os=$(uname -s | tr '[:upper:]' '[:lower:]')
    host_arch=$(uname -m)
    case "$host_arch" in
        x86_64) host_arch="amd64" ;;
        aarch64|arm64) host_arch="arm64" ;;
    esac
    case "$host_os" in
        darwin|linux) ;;
        *) host_os="windows" ;;
    esac
    fallback="$BINARIES_DIR/$APP_NAME"
    [[ "$host_os" == "windows" ]] && fallback="$fallback.exe"
    if [[ -f "$fallback" ]]; then
        FOUND_PLATFORMS+=("$host_os-$host_arch")
        FOUND_PATHS+=("$fallback")
        warn "Using $fallback as a single-platform $host_os-$host_arch payload"
    fi
fi

[[ ${#FOUND_PLATFORMS[@]} -gt 0 ]] || die "No platform binaries found in $BINARIES_DIR"

mkdir -p "$OUTPUT_DIR"
CHECKSUMS_FILE="$OUTPUT_DIR/SHA256SUMS"
: > "$CHECKSUMS_FILE"
UPLOAD_FILES=()

checksum_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

stage_file() {
    local src="$1"
    local dest_name="$2"
    local dest="$OUTPUT_DIR/$dest_name"
    cp "$src" "$dest"
    local checksum
    checksum=$(checksum_file "$dest")
    echo "$checksum  $dest_name" >> "$CHECKSUMS_FILE"
    UPLOAD_FILES+=("$dest")
    ok "Staged $dest_name (sha256:${checksum:0:16}…)"
}

echo ""
info "Staging release assets"

i=0
while [[ $i -lt ${#FOUND_PLATFORMS[@]} ]]; do
    platform="${FOUND_PLATFORMS[$i]}"
    src="${FOUND_PATHS[$i]}"
    extension=""
    [[ "${platform%-*}" == "windows" ]] && extension=".exe"
    stage_file "$src" "$APP_NAME-$VERSION-$platform$extension"
    i=$((i + 1))
done

# Keep first-install NSIS packages on the same release. Wails deliberately
# ignores names containing "-installer." when choosing an updater payload.
for arch in amd64 arm64; do
    installer=""
    for candidate in \
        "$BINARIES_DIR/$APP_NAME-$arch-installer.exe" \
        "$BINARIES_DIR/$APP_NAME-windows-$arch-installer.exe"; do
        if [[ -f "$candidate" ]]; then
            installer="$candidate"
            break
        fi
    done
    if [[ -n "$installer" ]]; then
        stage_file "$installer" "$APP_NAME-$arch-installer.exe"
    fi
done

UPLOAD_FILES+=("$CHECKSUMS_FILE")
ok "Wrote Wails checksum sidecar: $CHECKSUMS_FILE"

if [[ ! " ${FOUND_PLATFORMS[*]} " =~ " windows-amd64 " ]]; then
    warn "No windows-amd64 payload was staged; current production builds will not find this release"
fi

echo ""
echo -e "${BOLD}Staged release assets:${NC}"
ls -lh "${UPLOAD_FILES[@]}"
echo ""

if $DO_UPLOAD; then
    command -v gh >/dev/null 2>&1 || die "gh CLI is required for --upload"
    release_args=(
        release create "v$VERSION"
        --repo "$REPO"
        --title "ControlZebra v$VERSION"
        --notes "$RELEASE_NOTES"
    )
    if [[ "$VERSION" == *-* ]]; then
        release_args+=(--prerelease)
    fi
    gh "${release_args[@]}" "${UPLOAD_FILES[@]}"
    ok "Published https://github.com/$REPO/releases/tag/v$VERSION"
else
    echo -e "${BOLD}Next step:${NC}"
    printf '  gh release create %q --repo %q --title %q --notes %q' \
        "v$VERSION" "$REPO" "ControlZebra v$VERSION" "$RELEASE_NOTES"
    [[ "$VERSION" == *-* ]] && printf ' --prerelease'
    for upload_file in "${UPLOAD_FILES[@]}"; do
        printf ' %q' "$upload_file"
    done
    printf '\n'
    echo ""
    echo "The production updater reads the latest non-prerelease release from this repository."
fi
