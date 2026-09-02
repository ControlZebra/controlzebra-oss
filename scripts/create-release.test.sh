#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/controlzebra-release-test.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

INPUT_DIR="$TEST_ROOT/input"
OUTPUT_DIR="$TEST_ROOT/output"
mkdir -p "$INPUT_DIR" "$OUTPUT_DIR"

printf 'windows updater payload' > "$INPUT_DIR/control-zebra-windows-amd64.exe"
printf 'windows installer' > "$INPUT_DIR/control-zebra-amd64-installer.exe"

"$SCRIPT_DIR/create-release.sh" \
    --version 9.8.7 \
    --dir "$INPUT_DIR" \
    --output "$OUTPUT_DIR" >/dev/null

test -f "$OUTPUT_DIR/control-zebra-9.8.7-windows-amd64.exe"
test -f "$OUTPUT_DIR/control-zebra-amd64-installer.exe"
test -f "$OUTPUT_DIR/SHA256SUMS"
test ! -e "$OUTPUT_DIR/update.json"
test ! -e "$OUTPUT_DIR/SHA256SUMS.txt"
test "$(wc -l < "$OUTPUT_DIR/SHA256SUMS" | tr -d ' ')" = "2"

if command -v sha256sum >/dev/null 2>&1; then
    (cd "$OUTPUT_DIR" && sha256sum -c SHA256SUMS >/dev/null)
else
    (cd "$OUTPUT_DIR" && shasum -a 256 -c SHA256SUMS >/dev/null)
fi

if "$SCRIPT_DIR/create-release.sh" --version invalid --dir "$INPUT_DIR" --output "$OUTPUT_DIR" >/dev/null 2>&1; then
    echo "expected an invalid version to fail" >&2
    exit 1
fi

EMPTY_DIR="$TEST_ROOT/empty"
mkdir -p "$EMPTY_DIR"
if "$SCRIPT_DIR/create-release.sh" --version 9.8.7 --dir "$EMPTY_DIR" --output "$OUTPUT_DIR" >/dev/null 2>&1; then
    echo "expected an empty artifact directory to fail" >&2
    exit 1
fi

echo "create-release.sh tests passed"
