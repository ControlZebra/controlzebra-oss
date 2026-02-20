#!/usr/bin/env bash
#
# test-update-server.sh — Start a local update server for testing
#
# Serves a fake update manifest (v99.0.0) on localhost so you can test the full
# auto-update flow: check → download → verify → apply → relaunch.
#
# It uses the currently built binary as the "update" binary, so the apply step
# will replace the binary with the same version — safe for testing.
#
# Usage:
#   ./scripts/test-update-server.sh [port]
#
# Then start the app with the override URL:
#   CZ_UPDATE_URL=http://localhost:8080/ task dev
#
# Or test the sidecar directly:
#   ./bin/cz-updater check --url http://localhost:8080/ --current 0.0.0-dev --os darwin --arch arm64
#
set -euo pipefail

PORT=${1:-8080}
TEST_DIR="test-updates"
APP_NAME="control-zebra"

# ─── Detect current platform ──────────────────────────────────────────────────

OS_NAME=$(uname -s | tr '[:upper:]' '[:lower:]')
[[ "$OS_NAME" != "darwin" && "$OS_NAME" != "linux" ]] && OS_NAME="windows"

ARCH_NAME=$(uname -m)
[[ "$ARCH_NAME" == "x86_64" ]] && ARCH_NAME="amd64"
[[ "$ARCH_NAME" == "aarch64" || "$ARCH_NAME" == "arm64" ]] && ARCH_NAME="arm64"

PLATFORM="$OS_NAME-$ARCH_NAME"

# ─── Banner ────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  ControlZebra — Local Update Test Server             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Platform:   $PLATFORM"
echo "  Port:       $PORT"
echo "  Directory:  $TEST_DIR/"
echo ""

# ─── Locate a binary to serve as the "update" ─────────────────────────────────

BINARY=""

# Try platform-specific binary first
for candidate in \
    "bin/$APP_NAME-$PLATFORM" \
    "bin/$APP_NAME" \
    ; do
    if [[ -f "$candidate" ]]; then
        BINARY="$candidate"
        break
    fi
done

if [[ -z "$BINARY" ]]; then
    echo "✗  No binary found in bin/"
    echo ""
    echo "   Build first:"
    echo "     task darwin:build   # macOS"
    echo "     task windows:build  # Windows"
    echo "     task build          # Current platform"
    echo ""
    exit 1
fi

echo "✓  Source binary: $BINARY"

# ─── Create test directory and stage the binary ───────────────────────────────

mkdir -p "$TEST_DIR"

# Use v99.0.0 as the "new" version — guaranteed to be newer than any real build
TEST_VERSION="99.0.0"
TEST_BINARY_NAME="$APP_NAME-$TEST_VERSION-$PLATFORM"
TEST_BINARY="$TEST_DIR/$TEST_BINARY_NAME"

cp "$BINARY" "$TEST_BINARY"
echo "✓  Staged binary: $TEST_BINARY"

# ─── Compute checksum and size ─────────────────────────────────────────────────

if command -v sha256sum &>/dev/null; then
    CHECKSUM=$(sha256sum "$TEST_BINARY" | awk '{print $1}')
else
    CHECKSUM=$(shasum -a 256 "$TEST_BINARY" | awk '{print $1}')
fi

if [[ "$(uname)" == "Darwin" ]]; then
    SIZE=$(stat -f%z "$TEST_BINARY")
else
    SIZE=$(stat -c%s "$TEST_BINARY")
fi

SIZE_MB=$(echo "scale=1; $SIZE / 1048576" | bc 2>/dev/null || echo "?")
echo "✓  Checksum: sha256:${CHECKSUM:0:16}…"
echo "✓  Size: ${SIZE_MB} MB"

# ─── Generate test update manifest ────────────────────────────────────────────

cat > "$TEST_DIR/update.json" << EOF
{
  "version": "$TEST_VERSION",
  "releaseDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "releaseNotes": "## Test Update v$TEST_VERSION\\n\\nThis is a **test update** served from localhost:\\n\\n- This verifies the full auto-update flow\\n- Check → Download → Verify checksum → Apply → Relaunch\\n- The binary is the same version (safe for testing)",
  "platforms": {
    "$PLATFORM": {
      "url": "http://localhost:$PORT/$TEST_BINARY_NAME",
      "size": $SIZE,
      "checksum": "sha256:$CHECKSUM"
    }
  }
}
EOF

echo "✓  Manifest: $TEST_DIR/update.json"
echo ""

# ─── Display manifest ─────────────────────────────────────────────────────────

echo "═══ update.json ═══"
node -e "const fs=require('fs'); console.log(JSON.stringify(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')), null, 2));" "$TEST_DIR/update.json" 2>/dev/null || cat "$TEST_DIR/update.json"
echo "════════════════════"
echo ""

# ─── Usage instructions ───────────────────────────────────────────────────────

echo "┌─────────────────────────────────────────────────────────────────┐"
echo "│  To test in the app:                                           │"
echo "│                                                                │"
echo "│    CZ_UPDATE_URL=http://localhost:$PORT/ task dev               │"
echo "│                                                                │"
echo "│  To test the sidecar directly:                                 │"
echo "│                                                                │"
echo "│    ./bin/cz-updater check \\                                    │"
echo "│      --url http://localhost:$PORT/ \\                            │"
echo "│      --current 0.0.0-dev \\                                    │"
echo "│      --os $OS_NAME --arch $ARCH_NAME                           │"
echo "│                                                                │"
echo "│  To test download:                                             │"
echo "│                                                                │"
echo "│    ./bin/cz-updater download \\                                 │"
echo "│      --url http://localhost:$PORT/$TEST_BINARY_NAME \\          │"
echo "│      --checksum sha256:$CHECKSUM                               │"
echo "│                                                                │"
echo "└─────────────────────────────────────────────────────────────────┘"
echo ""
echo "Starting HTTP server on http://localhost:$PORT/ ..."
echo "Press Ctrl+C to stop."
echo ""

# ─── Start HTTP server ────────────────────────────────────────────────────────

node scripts/serve-static.js "$PORT" "$TEST_DIR"
