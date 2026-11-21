# V2.13.1 G01 — implementation plan

No source, migration, or database change is authorized by this phase. The sequence below is the order for later authorized work. It does not start that work.

## Dependencies

1. Isolated PostgreSQL on `127.0.0.1:55432` stays the only database for later HTTP runs. Port `5432` stays untouched.
2. Foundation ledger and the D25 fixtures stay as they are. A public-page repair is a separate authorized write and must pass `buildBlessBoardWebsiteSectionFixture` with church A’s id.
3. CSRF, RBAC, facility scope, appointment version checks, and the OTP test-provider refusal stay in place.
4. The healthcare brief PDF is still absent, so no new clinical module should be designed from guesswork.

## Priority

1. Run the already written D04 and D05 HTTP suites and the two Playwright specs against the isolated database. That is the only step that can move a `PARTIAL` row to a verified pass.
2. After those runs, repair only the assertions that fail. Do not widen booking, coupons, or clinical decision support.
3. Authorize one fixture write for the missing BlessBoard public page and structured draft, with the church id required.
4. Decide, outside this audit, whether a non-production deployment may set `BLESSBOARD_MEDIA_UPLOADS_ENABLED`. The default stays off.
5. Leave enabled public booking, coupons, CDS, drug interaction, auto-triage, and care plans deferred until a written product decision exists.

## What this phase did not do

No migration file was added. No fixture was inserted. HTTP, browser, commit, and push were not run. The 447 database-free tests were already green on this SHA during the previous unchanged-tree run; this phase did not edit product source, so that suite was not required to change.

```
FINAL=V2131_G01_REQUIREMENTS_AUDIT
AC_REQUIREMENTS_TOTAL=7
AC_IMPLEMENTED=0
AC_PARTIAL=7
AC_MISSING=0
BB_REQUIREMENTS_TOTAL=9
BB_IMPLEMENTED=0
BB_PARTIAL=9
BB_MISSING=0
SHARED_PLATFORM_GAPS=public-page fixture rows absent; media upload flag off; HTTP and browser NOT_RUN
MIGRATIONS_REQUIRED=0
DESIGN_DECISIONS_REQUIRED=healthcare brief PDF absent; media upload flag; enabled booking and coupons
REPORT_PATHS=docs/qa/V2131_G01_REQUIREMENTS_MATRIX.md,docs/qa/V2131_G01_IMPLEMENTATION_PLAN.md
BLOCKERS=Brief and both QA office documents were not on disk; G02 prompt body was not included in this request
```
