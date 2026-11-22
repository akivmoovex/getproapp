# Laptop development handoff

Continue on branch `V13` only. The G64 handoff commit is `a62a2be44529028ada2d2538802cb18c469a0ff2`. G65–G76 add an explicit pharmacy-queue notice, a non-persistent laboratory reference-rule preview, and fail-closed G66 persistence and browser tests. After you pull, `git rev-parse HEAD` is the latest `origin/V13` commit. `main` must remain `44eafec486a18aeef2777bbcc9683e43f68ebe0d`.

Worktree used here: `/Users/akivsolomon/Development/getproapp-v13`. Remote: `https://github.com/akivmoovex/getproapp.git`.

## Read first

- [BB_AC_COMPLETE_FUNCTIONALITY_SPEC.md](BB_AC_COMPLETE_FUNCTIONALITY_SPEC.md)
- [REQUIREMENTS_TRACEABILITY_MATRIX.md](REQUIREMENTS_TRACEABILITY_MATRIX.md)
- [FEATURE_STATUS_AND_GAPS.md](FEATURE_STATUS_AND_GAPS.md)
- [COMPLETE_USER_JOURNEYS.md](COMPLETE_USER_JOURNEYS.md)
- [DATABASE_AND_MIGRATION_DEPENDENCIES.md](DATABASE_AND_MIGRATION_DEPENDENCIES.md)
- [../qa/V13_G36_ISOLATED_TEST_READINESS.md](../qa/V13_G36_ISOLATED_TEST_READINESS.md)

## Leave untracked

`docs/qa/V2131_GAP_G08_FINAL_REPORT.md` is a superseded note. Do not delete it and do not stage it as the G08 audit. The committed G08 audit is `docs/qa/V2131_G08_*.md`.

## Do not do these on a fresh laptop without a new authorization

- Connect to port 5432 or to `127.0.0.1:55432`
- Apply migration 043 or rerun foundation bootstrap
- Insert BlessBoard public-page rows
- Set the database-write, HTTP, or browser authorization flags
- Set `BLESSBOARD_MEDIA_UPLOADS_ENABLED`
- Enable public booking or add a coupon
- Add a prescription catalogue picker
- Invent diagnosis codes, reference ranges, or paper-disposal rules
- Force-push, rebase, or change `main`

## Safe check

Unset database URLs and the authorization flags, then run:

`node --test --test-concurrency=1 --test-timeout=30000 tests/v13/contract/*.test.js tests/v13/unit/*.test.js`

The suite before this pass was 486 passed and 0 failed. This pass is 487 passed and 0 failed. A failure there is a real failure. A gated file that skips is `NOT_RUN`.

## Product version

Stay on 2.13.1. Do not call the branch production-ready or healthcare-compliant. Isolated HTTP and Playwright are the next recommended action, in the order in the G36 readiness note, and only after those flags are explicitly authorized.
