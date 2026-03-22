#!/usr/bin/env bash
# rawq submodule 업데이트 확인 및 갱신.
# Usage: ./scripts/update-rawq.sh [--apply]
#   기본: 업데이트 유무만 확인
#   --apply: 업데이트가 있으면 submodule을 최신으로 갱신하고 빌드

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAWQ_DIR="$REPO_ROOT/vendor/rawq"

# 현재 고정된 커밋
CURRENT="$(git -C "$REPO_ROOT" submodule status vendor/rawq | awk '{print $1}' | tr -d '+-')"

# 원격 최신 커밋 확인
git -C "$RAWQ_DIR" fetch origin --quiet
LATEST="$(git -C "$RAWQ_DIR" rev-parse origin/main)"

echo "Current: ${CURRENT:0:12}"
echo "Latest:  ${LATEST:0:12}"

if [ "$CURRENT" = "$LATEST" ]; then
    echo "rawq is up to date."
    exit 0
fi

# 변경된 커밋 요약
echo ""
echo "New commits:"
git -C "$RAWQ_DIR" log --oneline "${CURRENT}..${LATEST}" | head -20

if [ "${1:-}" = "--apply" ]; then
    echo ""
    echo "Updating submodule..."
    git -C "$RAWQ_DIR" checkout main
    git -C "$RAWQ_DIR" pull origin main
    echo "Building rawq..."
    "$REPO_ROOT/scripts/build-rawq.sh" --release
    echo ""
    echo "Done. Don't forget to commit:"
    echo "  git add vendor/rawq"
    echo "  git commit -m 'chore: update rawq to $(git -C "$RAWQ_DIR" describe --tags --always)'"
else
    echo ""
    echo "Run with --apply to update and rebuild."
fi
