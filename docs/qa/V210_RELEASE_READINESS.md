# V2.10 Release Readiness

Date: 2026-10-17  
Branch: `V10`

## Decision

**NOT_READY**

V10 is safe to freeze for continued QA, but is not ready for production release. No confirmed unresolved product security defect was found; readiness is blocked by incomplete isolated-database coverage, eight recorded sanity failures, three untested historical AC issues, and missing browser viewport verification.

## Git safety

- Local V10: `e79f9533abda4e2dd17384fcb19db9f944a99356`
- Remote `origin/V10`: same SHA
- `origin/main`: `78c1764314501620e8f7a108095d837524db97a5`
- `origin/V9`: `037cbaa3c26453dbea0962a7a82c889c5d550007`
- Backup tag preserved: `backup-v10-before-main-reset-20261017` → old V10 SHA
- Worktree clean; recent changes are QA/runtime fixes already committed on V10.

## Product readiness

- BlessBoard: **NOT_READY**. Core registration, website engine, editor, publishing, RBAC, and most workflows pass. Remaining blockers are color baseline, member database coverage, service-time database coverage, pastoral database coverage, and browser coverage.
- ActiveClinic: **NOT_READY**. Core registration, patient, booking, diagnostics, recovery, directory, and security contracts pass. Remaining blockers are theme lifecycle assertions, the stale city fixture, incomplete registration schema, untested historical issues, and browser coverage.
- Platform: **NOT_READY**. Security regression passed 91/91 executed tests, but one PostgreSQL pastoral test remains skipped and full critical integration coverage is incomplete.

## Test accounting

Reported sanity/security batches: 301 tests total; 291 passed, 8 failed, 2 skipped. The security batch itself was 91 passed, 0 failed, 1 skipped.

Failures are environment/fixture-related in the reports, not confirmed production defects:

- BlessBoard service-time suite: 7 failures with lookup/503 behavior in the incomplete isolated DB.
- ActiveClinic registration lifecycle: 1 stale fixture omitted required `city`; the registration schema relation was also unavailable.

## Migrations and deployment prerequisites

No new V2.10 migration is required by the documented product changes. Existing platform, BlessBoard, and ActiveClinic migrations must be applied and schema-validated in an isolated staging/QA database before release. Production migration status remains unverified and must be checked by the deployment owner without mutating production during QA.

Before deployment:

1. Provision isolated PostgreSQL databases with all required schemas and guards.
2. Correct the stale ActiveClinic fixture and rerun blocked suites.
3. Rerun BlessBoard service-time, member, and pastoral workflows.
4. Complete AC theme lifecycle and historical AC issue coverage.
5. Run approved 1440px and 390px browser checks.
6. Reconcile all failures/skips and obtain release approval.
7. Verify deployment SHA and migration plan at release time.

Production was not accessed, mutated, or deployed.

## QA-10 final gate recheck

Final verified V10 SHA: `443f8b00bd2c8993d067adf12541b20be8bbd85b`, matching `origin/V10`. Main and V9 remain unchanged.

QA-07 created and validated the disposable local database `getpro_v210_qa_test_20261017`, owned by the local test user and initially empty. Existing platform, BlessBoard, ActiveClinic, GetPro, NGO, and seed migrations applied through ceilings platform 047, BlessBoard 128, ActiveClinic 042, GetPro 001, NGO 001, seeds 011. No new migration was created or expected.

QA-08 reran the blocked database workflows without skips: 49 tests, 40 passed, 9 failed. The seven BlessBoard service-time failures remain `lookup_error`/503 environment/schema-fixture failures; the ActiveClinic failure remains the incomplete city fixture; pastoral setup remains blocked by a duplicate test host-slug fixture. Member registration/create/search tests passed. These are not confirmed product defects.

The security batch remains 91 passed, 0 failed, 1 PostgreSQL pastoral skip. Browser smoke remains blocked: only two generic tests completed before the bounded Playwright run stalled; neither required 1440×900 nor 390×844 coverage was completed. The three historical AC issues `AC-HIST-01`, `AC-HIST-05`, and `AC-HIST-08` have no supplied focused coverage and remain untested.

About pages were statically verified at version 2.10 for both products. No critical security defect was confirmed. Release decision remains **NOT_READY** because critical database workflows, browser viewports, and three historical AC issues remain unresolved/unverified.
