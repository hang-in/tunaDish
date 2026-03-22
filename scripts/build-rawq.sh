#!/usr/bin/env bash
# rawq 바이너리를 vendor/rawq에서 빌드하여 Tauri sidecar 위치에 복사한다.
# Usage: ./scripts/build-rawq.sh [--release]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAWQ_DIR="$REPO_ROOT/vendor/rawq"
BINARIES_DIR="$REPO_ROOT/client/src-tauri/binaries"

# Rust target triple
TARGET_TRIPLE="$(rustc -vV | grep host | cut -d' ' -f2)"

# 빌드 모드
if [[ "${1:-}" == "--release" ]]; then
    PROFILE="release"
    cargo build --release --manifest-path "$RAWQ_DIR/Cargo.toml"
else
    PROFILE="debug"
    cargo build --manifest-path "$RAWQ_DIR/Cargo.toml"
fi

# 바이너리 복사
mkdir -p "$BINARIES_DIR"
SRC="$RAWQ_DIR/target/$PROFILE/rawq"
DEST="$BINARIES_DIR/rawq-$TARGET_TRIPLE"

cp "$SRC" "$DEST"
chmod +x "$DEST"

echo "rawq binary copied to: $DEST"
echo "Target: $TARGET_TRIPLE, Profile: $PROFILE"
