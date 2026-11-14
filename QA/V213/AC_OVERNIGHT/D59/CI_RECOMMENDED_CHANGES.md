# CI recommended changes

These edits were not applied. The holds for this stage do not permit a workflow change.

## 1. Make Stage A run the same non-database command as local G1

Replace `npm run test:v13:ac` in both running jobs with the unit, contract, and quality globs already used by the BlessBoard Stage A step, plus `tests/v2-02-platform-admin-rbac-convergence.test.js`. Do not add `tests/v13/integration` or Playwright.

## 2. Require a full SHA

Copy the BlessBoard pin step into the ActiveClinic Stage A job, and make an empty `target_sha` fail the step. Do not fall back to `github.ref`.

```
if [ -z "${TARGET_SHA}" ]; then
  echo "target_sha is required"
  exit 1
fi
printf '%s' "$TARGET_SHA" | grep -Eq '^[0-9a-fA-F]{40}$'
test "$(git rev-parse HEAD)" = "$TARGET_SHA"
```

## 3. Upload the result

Add an `actions/upload-artifact` step with `if: always()` whose file contains the checkout SHA, `github.run_id`, and the test exit code. Do not use `if-no-files-found: ignore` for that file.

## Leave held

Do not remove `if: ${{ false }}` from Stage B, Stage C, or authenticated Stage D. Do not set either write flag to `1`. Do not add a migrate or deploy step. Do not wire `enable_db_stages` to those jobs until a separate approval says the disposable database exists.
