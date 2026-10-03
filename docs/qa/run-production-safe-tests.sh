#!/bin/bash
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO"
MANIFEST="$REPO/docs/qa/production-safe-tests.manifest"

# Load production env only (never .env testing)
set -a
# shellcheck disable=SC1091
source "$REPO/.env.production.local"
set +a

export GETPRO_SKIP_DOTENV=1
export GETPRO_TEST_DB=1
export GETPRO_PG_POOL_MAX="${GETPRO_PG_POOL_MAX:-8}"
export NODE_ENV=test
export TEST_DATABASE_URL="$DATABASE_URL"
# RC02: isolation / V5 gates require explicit DATABASE_URL (not TEST_DATABASE_URL alone).
export DATABASE_URL="$TEST_DATABASE_URL"
export DEPLOYMENT_ENV=production
export DATABASE_IDENTITY_EXPECTED=moovex-platform-v7
export DATABASE_IDENTITY_ENV=production

# Registered production profiles.
# BB prod catalogue code = blessboard-com-production (canonical/apex = blessboard.com only).
# "blessboard-org-production" is not registered. Env-driven .org/dual-TLD tests clear
# PLATFORM_DEPLOYMENT_CODE via tests/helpers/blessBoardDomainTestEnv.js.
PROFILE_BB="${GETPRO_BB_PROD_PROFILE:-blessboard-com-production}"
PROFILE_AC="${GETPRO_AC_PROD_PROFILE:-activeclinic-org-production}"
PROFILE_PLATFORM="${GETPRO_PLATFORM_PROD_PROFILE:-moovex-platform-production}"

python3 - <<'PY'
import os, sys
u = os.environ.get("TEST_DATABASE_URL", "")
if "ubbdyfcyhtifuttmgmfy" not in u or "xpcpvbtzqdzhwkwlyhtb" in u:
    sys.exit("REFUSING: TEST_DATABASE_URL is not production project ubbdyfcyhtifuttmgmfy")
if not os.environ.get("DATABASE_URL"):
    sys.exit("REFUSING: DATABASE_URL must be set (aliased from TEST_DATABASE_URL)")
print("PROD_SAFE_GATE=PASS")
print("DATABASE_URL_ALIAS=PASS")
PY

BB_LIST="$(mktemp)"
AC_LIST="$(mktemp)"
PLATFORM_LIST="$(mktemp)"
trap 'rm -f "$BB_LIST" "$AC_LIST" "$PLATFORM_LIST"' EXIT

while IFS= read -r f; do
  [[ -z "$f" || "$f" =~ ^# ]] && continue
  base="$(basename "$f")"
  if [[ "$f" == *activeclinic* || "$base" == ac-* ]]; then
    printf '%s\n' "$f" >>"$AC_LIST"
  elif [[ "$f" == *blessboard* || "$f" == *church-* || "$base" == church-* ]]; then
    printf '%s\n' "$f" >>"$BB_LIST"
  else
    printf '%s\n' "$f" >>"$PLATFORM_LIST"
  fi
done <"$MANIFEST"

run_group() {
  local label="$1"
  local profile="$2"
  local list_file="$3"
  if [[ ! -s "$list_file" ]]; then
    echo "SKIP_${label}=no_files"
    return 0
  fi
  local count
  count="$(wc -l <"$list_file" | tr -d ' ')"
  echo "RUNNING_${label} count=${count} PLATFORM_DEPLOYMENT_CODE=${profile}"
  # shellcheck disable=SC2046
  PLATFORM_DEPLOYMENT_CODE="$profile" \
    DEPLOYMENT_ENV=production \
    DATABASE_URL="$TEST_DATABASE_URL" \
    TEST_DATABASE_URL="$TEST_DATABASE_URL" \
    GETPRO_TEST_DB=1 \
  # Default concurrency 1: prod DB session pool (~15) is exhausted by parallel
  # church route tests (EMAXCONNSESSION → spurious 500s). Override via GETPRO_TEST_CONCURRENCY.
    node --test --test-concurrency="${GETPRO_TEST_CONCURRENCY:-1}" $(cat "$list_file")
}

AC_SMOKE="$REPO/tests/production/activeclinic-production-smoke.test.js"
FAIL=0
if [[ -f "$AC_SMOKE" ]]; then
  echo "RUNNING_AC_PRODUCTION_SMOKE"
  PLATFORM_DEPLOYMENT_CODE="$PROFILE_AC" \
    DEPLOYMENT_ENV=production \
    DATABASE_URL="$TEST_DATABASE_URL" \
    TEST_DATABASE_URL="$TEST_DATABASE_URL" \
    GETPRO_TEST_DB=1 \
    node --test --test-concurrency=1 "$AC_SMOKE" || FAIL=1
fi

run_group "BB_PROD_SAFE" "$PROFILE_BB" "$BB_LIST" || FAIL=1
run_group "AC_PROD_SAFE" "$PROFILE_AC" "$AC_LIST" || FAIL=1
run_group "PLATFORM_PROD_SAFE" "$PROFILE_PLATFORM" "$PLATFORM_LIST" || FAIL=1
exit "$FAIL"
