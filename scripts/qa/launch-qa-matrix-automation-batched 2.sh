#!/usr/bin/env bash
# Durable launch for V2.03 Phase C QA matrix automation (unique cited files).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${V203_PHASE_C_OUT:-/tmp/v203-phase-c}"
mkdir -p "$OUT"
cd "$ROOT"

export NODE_ENV=test
export BATCH_SIZE="${BATCH_SIZE:-10}"
export BATCH_PAUSE_MS="${BATCH_PAUSE_MS:-500}"
export BATCH_WATCHDOG_MS="${BATCH_WATCHDOG_MS:-720000}"
export DB_HOST="${DB_HOST:-127.0.0.1}"
export DB_PORT="${DB_PORT:-5432}"
export DB_SSL="${DB_SSL:-false}"
unset ALLOW_PROD_DB || true
unset FOUNDATION_ADMIN_DATABASE_URL || true
unset DATABASE_URL_ADMIN || true

if [[ ! -f "$OUT/matrix-files.txt" || ! -f "$OUT/execution-ledger.json" ]]; then
  echo "MISSING_LEDGER: build matrix-files.txt + execution-ledger.json first"
  exit 2
fi

if [[ -f "$OUT/runner.pid" ]] && kill -0 "$(cat "$OUT/runner.pid")" 2>/dev/null; then
  echo "ALREADY_RUNNING pid=$(cat "$OUT/runner.pid")"
  exit 1
fi

if [[ -z "${BATCH_RESUME_FROM:-}" ]]; then
  : >"$OUT/matrix-batched.log"
fi

nohup node scripts/qa/run-qa-matrix-automation-batched.js \
  >"$OUT/nohup.out" 2>&1 &
echo $! >"$OUT/runner.pid"
disown || true
echo "LAUNCHED_PID=$(cat "$OUT/runner.pid")"
echo "LOG=$OUT/matrix-batched.log"
echo "META=$OUT/matrix-batched-meta.json"
echo "FILES=$(wc -l < "$OUT/matrix-files.txt" | tr -d ' ')"
echo "BATCH_SIZE=$BATCH_SIZE"
