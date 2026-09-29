#!/usr/bin/env bash
# Durable launch for V2.03 Phase B batched canonical suite.
# Prefer this over node {detached:true} (detached spawn correlated with Postgres.app XX000 trust rejects).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${V203_PHASE_B_OUT:-/tmp/v203-canonical-phase-b}"
mkdir -p "$OUT"
cd "$ROOT"

export NODE_ENV=test
export BATCH_SIZE="${BATCH_SIZE:-12}"
export BATCH_PAUSE_MS="${BATCH_PAUSE_MS:-500}"
export BATCH_WATCHDOG_MS="${BATCH_WATCHDOG_MS:-720000}"
export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_PORT="${DB_PORT:-5432}"
export DB_SSL="${DB_SSL:-false}"
unset ALLOW_PROD_DB || true
# Prefer code-resolved Unix-socket admin URL (do not force TCP).
unset FOUNDATION_ADMIN_DATABASE_URL || true
unset DATABASE_URL_ADMIN || true

if [[ -f "$OUT/runner.pid" ]] && kill -0 "$(cat "$OUT/runner.pid")" 2>/dev/null; then
  echo "ALREADY_RUNNING pid=$(cat "$OUT/runner.pid")"
  exit 1
fi

# Fresh run unless BATCH_RESUME_FROM is set.
if [[ -z "${BATCH_RESUME_FROM:-}" ]]; then
  : >"$OUT/canonical-batched.log"
fi

nohup node scripts/qa/run-canonical-manifest-batched.js \
  >"$OUT/nohup.out" 2>&1 &
echo $! >"$OUT/runner.pid"
disown || true
echo "LAUNCHED_PID=$(cat "$OUT/runner.pid")"
echo "LOG=$OUT/canonical-batched.log"
echo "META=$OUT/canonical-batched-meta.json"
echo "BATCH_SIZE=$BATCH_SIZE"
echo "BATCH_RESUME_FROM=${BATCH_RESUME_FROM:-1}"
