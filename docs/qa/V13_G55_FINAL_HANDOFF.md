# V13 G55 — final evening handoff

Pull `origin/V13` after this file is pushed. The parent of this handoff commit is the G54 commit `4f04cfc303bcd3aff814663f276e95017253d68b`, which is already on `origin/V13`. `main` remains `44eafec486a18aeef2777bbcc9683e43f68ebe0d`.

Product version is 2.13.1.

## Counts

ActiveClinic: total 30, implemented 16, partial 7, blocked 6, deferred 1.
BlessBoard: total 17, implemented 13, partial 3, blocked 1, deferred 0.
Requirements completed in G46–G54: 0. Remaining partial or blocked: 17.

## What changed

Encounter screens show Reception, Laboratory queue, Pharmacy, and Billing only when the signed-in staff member already has that view permission. `openMigrationBatch` returns `access_denied` and does not query unless document-create authorization is passed. It is still not mounted on HTTP. No BlessBoard source changed. No clinical, prescribing, billing, or retention policy changed.

## Tests and data

Safe tests: 475 passed, 0 failed, 0 skipped. HTTP tests: `NOT_RUN`. Playwright tests: `NOT_RUN`.
Migration 043: prepared, reviewed, not executed. No other migration was added.
Database mutation: no. Shared PostgreSQL: not contacted. Isolated PostgreSQL: not modified.

## Still blocked

Diagnosis codes, reference ranges, the manual-prescription catalogue decision, binary clinical files, paper destruction, export execution, restore, accessibility, monitoring, performance, public-page fixture rows, media-upload enablement, a new prayer module, and unexecuted reports. AC-29 interoperability stays deferred. `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` stays untracked and unapproved.

## Read on the next laptop

- `docs/functional/BB_AC_COMPLETE_FUNCTIONALITY_SPEC.md`
- `docs/functional/LAPTOP_DEVELOPMENT_HANDOFF.md`
- `docs/functional/REQUIREMENTS_TRACEABILITY_MATRIX.md`
- `docs/qa/V13_G46_EXACT_GAP_INVENTORY.md`
- `docs/qa/V13_G36_ISOLATED_TEST_READINESS.md`

Work only on branch `V13` in a fresh clone or `git pull` of this branch. Do not reset, rebase, or force-push. Do not connect to port 5432. Do not apply migration 043, insert public pages, or set booking, media, HTTP, or browser flags unless a later prompt authorizes that exact step.

## Isolated verification, when authorized

Use `127.0.0.1:55432` only. Order: D04, D05, auth and OTP, portal and appointments, BlessBoard content except homepage sections, G03–G05, then ActiveClinic Playwright, then BlessBoard Playwright after a public-page fixture write is separately authorized. Do not enable booking or media as part of that run.

## Release

QA candidate: the source is safe to pull, and the open requirements are not complete. Release ready: no. Not healthcare-compliance-ready.

```
G54_COMMIT=4f04cfc303bcd3aff814663f276e95017253d68b
G54_PUSH=PUSHED
REMOTE_SHA_MATCH_AT_G54=YES
SAFE_TESTS_PASSED=475
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
MIGRATION_043=NOT_EXECUTED
RELEASE_READY=NO
```
