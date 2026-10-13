# V2.09 Regression Baseline

Branch: `V9`  
SHA: `4b0d2749ab995d3649d4e8d51435b70ba5deff42`  
Database: `getpro_v209_unified_e2e_test`  
Identity/profile: `moovex-platform-v7` / `moovex-platform-testing`

## Environment

The local Apex health endpoint returned HTTP 200 and reported the testing
profile, V7 identity, and testing environment. The canonical ActiveClinic
launcher validates localhost, the exact QA database, and the same identity
before starting. No production connection or database mutation was used.

## Executed focused batches

- `node --test --test-concurrency=1 tests/activeclinic-patient-portal.test.js`: 9 passed, 0 failed.
- `node --test --test-concurrency=1 tests/activeclinic-mf08-patient-registration.test.js tests/activeclinic-mf09-patient-dashboard.test.js`: 14 passed, 0 failed.
- `CI=1 npx playwright test tests/ac-staff-lifecycle.spec.cjs --retries=0`: 2 lifecycle runs passed.
- `CI=1 npx playwright test tests/ac-receptionist-rbac.spec.cjs --retries=0 --workers=1`: 2 runs passed.
- `CI=1 npx playwright test tests/ac-patient-isolation.spec.cjs --retries=0 --workers=1`: 2 runs passed.
- `CI=1 npx playwright test tests/ac-cross-product-rbac.spec.cjs --retries=0 --workers=1`: 6 tests passed across 2 runs; unauthenticated controls only.

The focused RBAC batch also exercised ActiveClinic registration authorization
and passed 12 tests. A combined portal/RBAC run previously passed 20/21; the
guest-token failure was corrected as a stale fixture field and the portal
suite subsequently passed 9/9.

## Coverage and gaps

Implemented coverage includes ActiveClinic registration/login, staff
invitation, patient creation and portal activation, patient staff-route
denial, cross-clinic denial, website publication, receptionist RBAC, local
platform-admin login, platform-role assignment, and tenant-seat entitlement.

The 812 discovered test files were not run as one batch. Remaining gaps are
role-aware cross-product denial for authenticated non-platform identities,
full BlessBoard staff/member browser lifecycle, and the member portal
activation contract. No implemented member activation contract was established;
that requirement remains pending.

Known open items: authenticated non-platform Apex negative fixtures are not
available in the local two-port setup; two-port cross-product checks therefore
prove unauthenticated denial only. No product regression was confirmed.
