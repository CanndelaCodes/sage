#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${SAGE_IMAGE:-${SAGEBOT_IMAGE:-sage:local}}"
CONFIG_DIR="${SAGE_CONFIG_DIR:-${SAGEBOT_CONFIG_DIR:-$HOME/.sage}}"
WORKSPACE_DIR="${SAGE_WORKSPACE_DIR:-${SAGEBOT_WORKSPACE_DIR:-$HOME/.sage/workspace}}"
PROFILE_FILE="${SAGE_PROFILE_FILE:-${SAGEBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e SAGE_LIVE_TEST=1 \
  -e SAGE_LIVE_MODELS="${SAGE_LIVE_MODELS:-${SAGEBOT_LIVE_MODELS:-all}}" \
  -e SAGE_LIVE_PROVIDERS="${SAGE_LIVE_PROVIDERS:-${SAGEBOT_LIVE_PROVIDERS:-}}" \
  -e SAGE_LIVE_MODEL_TIMEOUT_MS="${SAGE_LIVE_MODEL_TIMEOUT_MS:-${SAGEBOT_LIVE_MODEL_TIMEOUT_MS:-}}" \
  -e SAGE_LIVE_REQUIRE_PROFILE_KEYS="${SAGE_LIVE_REQUIRE_PROFILE_KEYS:-${SAGEBOT_LIVE_REQUIRE_PROFILE_KEYS:-}}" \
  -v "$CONFIG_DIR":/home/node/.sage \
  -v "$WORKSPACE_DIR":/home/node/.sage/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
