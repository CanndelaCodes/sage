#!/usr/bin/env bash
set -euo pipefail

cd /repo

export SAGE_STATE_DIR="/tmp/sage-test"
export SAGE_CONFIG_PATH="${SAGE_STATE_DIR}/sage.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${SAGE_STATE_DIR}/credentials"
mkdir -p "${SAGE_STATE_DIR}/agents/main/sessions"
echo '{}' >"${SAGE_CONFIG_PATH}"
echo 'creds' >"${SAGE_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${SAGE_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm sage reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${SAGE_CONFIG_PATH}"
test ! -d "${SAGE_STATE_DIR}/credentials"
test ! -d "${SAGE_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${SAGE_STATE_DIR}/credentials"
echo '{}' >"${SAGE_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm sage uninstall --state --yes --non-interactive

test ! -d "${SAGE_STATE_DIR}"

echo "OK"
