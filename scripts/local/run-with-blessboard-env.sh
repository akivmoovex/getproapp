#!/usr/bin/env bash
# Load a BlessBoard local env file and run a command in the same process.
# Usage:
#   scripts/local/run-with-blessboard-env.sh testing|production <command> [args...]
#
# Never prints DATABASE_URL or other secret values.
# Does not load repo-root .env — only the selected *.local file.
# Selected file values override ambient process environment for keys defined in the file.

set -euo pipefail

usage() {
  echo "Usage: scripts/local/run-with-blessboard-env.sh <testing|production> <command> [args...]" >&2
  echo "Loads .env.<name>.local from the repository root, then execs the command." >&2
}

if [[ $# -lt 2 ]]; then
  usage
  exit 2
fi

ENV_NAME="$1"
shift

case "$ENV_NAME" in
  testing|production) ;;
  *)
    echo "error: environment must be 'testing' or 'production' (got: ${ENV_NAME})" >&2
    usage
    exit 2
    ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENV_BASENAME=".env.${ENV_NAME}.local"
ENV_FILE="${REPO_ROOT}/${ENV_BASENAME}"

# Refuse path tricks — only the exact expected basename under repo root.
if [[ "$(basename "$ENV_FILE")" != "$ENV_BASENAME" ]]; then
  echo "error: refused unexpected env filename" >&2
  exit 2
fi

case "$ENV_FILE" in
  "${REPO_ROOT}/"*) ;;
  *)
    echo "error: env file must be under repository root" >&2
    exit 2
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "error: missing ${ENV_BASENAME} (create it locally; it is gitignored)" >&2
  echo "hint: see scripts/local/env.${ENV_NAME}.local.example" >&2
  exit 2
fi

# Resolve to real path and re-validate containment (symlinks).
if command -v realpath >/dev/null 2>&1; then
  ENV_REAL="$(realpath "$ENV_FILE")"
  ROOT_REAL="$(realpath "$REPO_ROOT")"
else
  ENV_REAL="$(cd "$(dirname "$ENV_FILE")" && pwd)/$(basename "$ENV_FILE")"
  ROOT_REAL="$REPO_ROOT"
fi

case "$ENV_REAL" in
  "${ROOT_REAL}/"*) ;;
  *)
    echo "error: env file resolves outside repository root" >&2
    exit 2
    ;;
esac

if [[ "$(basename "$ENV_REAL")" != "$ENV_BASENAME" ]]; then
  echo "error: refused unexpected resolved env filename" >&2
  exit 2
fi

# Load selected local env (overrides ambient Cursor/.env pollution for these keys).
set -a
# shellcheck disable=SC1090
source "$ENV_REAL"
set +a

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "error: DATABASE_URL is empty after loading ${ENV_BASENAME}" >&2
  exit 2
fi

# Safe progress line — never print secret values.
echo "blessboard-env: loaded=${ENV_BASENAME} target=${ENV_NAME}" >&2

exec "$@"
