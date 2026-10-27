# V211-QA169 BlessBoard Security Regression

## Scope and safety

No product runtime files were changed. No database reset, migration, truncate, drop, or mutation was performed. The existing authenticated V5 HTTP suites were inspected, but suites whose setup calls `resetFoundationDatabase()` were not executed because this task prohibits database reset operations.

The configured QA137 HTTP tests require both `V211_QA137_RUN_REAL=1` and a local disposable PostgreSQL URL. That authorized runtime harness was not active in this session, so discovery was not counted as execution.

## Coverage assessment

### BB-10 member registration

Existing executable coverage:

- `tests/bb-v211-qa137-member-registration.http.test.js` — `BB-10 HTTP registration form is served in the tenant context`
- `tests/bb-v211-qa137-member-registration.http.test.js` — `BB-10 HTTP negative CSRF cases`
- `tests/bb-v211-qa137-member-registration.spec.cjs` — `BB-10 member registration preserves CSRF and creates one registration`
- `tests/bb-v211-qa137-member-registration.spec.cjs` — `BB-10 browser form preserves issued CSRF token`

Recorded QA evidence covers valid CSRF, invalid CSRF denial, and registration persistence. New execution: `BLOCKED` because the configured QA137 disposable harness was unavailable.

### Editor and tenant security

Existing suites include:

- `tests/v7-tenant-isolation-security.test.js`
- `tests/v7-website-rbac.test.js`
- `tests/v7-website-draft-live-integrity.test.js`
- `tests/v7-website-rbac.test 2.js`

These cover anonymous mutation denial, wrong-tenant website access, cross-tenant version/content isolation, publish authorization, and draft/live separation. They require database-provisioning setup and were not rerun under the no-reset constraint. Classification: `BLOCKED` for this execution.

### Staff invitation

Existing executable coverage:

- `tests/blessboard-staff-invitation.test.js` — `role and branch scope enforced`
- `tests/blessboard-staff-invitation.test.js` — `token expiration and single use`
- `tests/blessboard-staff-invitation.test.js` — `revocation works`
- `tests/blessboard-staff-invitation.test.js` — `unauthorized role escalation fails`
- `tests/bb-v211-qa137-staff-invitation.http.test.js` — `HTTP invalid, replayed and wrong-church invitations`

Prior QA146/QA147 recorded HTTP lifecycle, replay, invalid-token, and authorization results as passing. New execution is `BLOCKED` because the authorized disposable harness was not active.

### Announcements

Existing executable coverage in `tests/blessboard-announcements.test.js` includes:

- `HQ publishes church-wide with confirm; drafts without confirm`
- `branch admin cannot publish church-wide; can publish assigned branch`
- `campus branch admin cannot manage HQ branch announcements`
- `isolates member audiences and branch scope for reads`
- `branch admin list/create/preview/publish/archive GUI with CSRF and delivery summary`
- `HQ church-wide and branch-scoped announcement GUI preserve publish/preview/archive/concurrency`

Prior local QA157 evidence recorded published public visibility, draft/future hiding, audience restrictions, and branch targeting. New execution is `BLOCKED` by the prohibited reset-based setup.

## Tenant fixture finding

The existing reports reference one verified synthetic tenant and do not provide a second concurrently authorized synthetic tenant in the active harness. Therefore authenticated wrong-tenant mutation tests cannot be newly exercised safely without fabricating permissions or provisioning data. Classification: `TEST_BLOCKED`, not pass.

## Results

- `BB_10`: `PARTIALLY_VERIFIED` from prior QA evidence; current execution blocked.
- `CSRF_VALID`: prior QA PASS; current execution blocked.
- `CSRF_INVALID`: prior QA PASS; current execution blocked.
- `WRONG_TENANT`: blocked; second authorized tenant fixture unavailable.
- `ANNOUNCEMENT_AUDIENCE`: prior local PASS; current execution blocked.
- `ANNOUNCEMENT_BRANCH_SCOPE`: prior local PASS; current execution blocked.
- `STAFF_INVITATION_SECURITY`: prior local PASS; current execution blocked.
- `TESTS_PASS`: 0 newly executed in this no-reset run.
- `TESTS_FAIL`: 0.
- `TESTS_SKIP`: 0.
- `TESTS_BLOCKED`: 4 security groups requiring the unavailable/reset-based harness.
- `CONFIRMED_PRODUCT_DEFECTS`: none.

No test files were modified or created. No runtime security behavior was weakened.
