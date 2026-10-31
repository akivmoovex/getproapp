# BlessBoard V2.12 Phase 5E Priority QA

Status: `PARTIAL — RELEASE BLOCKED`

## Executed batches

### P0 security batch

Files (7): `blessboard-auth-schema.test.js`, `blessboard-authorization.test.js`, `blessboard-rbac-foundation.test.js`, `v8-shared-rbac-tenant-isolation.test.js`, `v8-tenant-product-isolation.test.js`, `blessboard-v5-csrf-action-audit.test.js`, `blessboard-v5-input-output-safety.test.js`.

Result: 82/82 pass, 0 fail, 0 skip. Raw TAP: `phase5e-p0.tap`.

### P1 workflow batch

Files (12): members schema/registration/portal, member journey foundation/workflow, announcements, branch announcements/events, branch service times, content admin, website editing completeness, website draft/review/publish, and media.

Result: 165 pass, 1 fail, 1 skip across 167 cases. Raw TAP: `phase5e-p1.tap`.

Failure:

- File: `tests/blessboard-members-schema.test.js`
- Case: `creates member tables and keeps privacy column surface narrow`
- Location: line 148 (assertion at line 182)
- Error: `date_of_birth`: expected `false`, actual `true`
- Classification: `STALE_TEST_EXPECTATION` / legacy baseline failure
- V12 regression status: `NO`; migration 120 is identical in V11 and V12
- Release impact: test maintenance required; no runtime modification made

Skip:

- File: `tests/church-branch-announcements-events.test.js`
- Case: suite skipped because PostgreSQL test database was not configured in the local process (`TEST_DATABASE_URL`/`GETPRO_TEST_DB`).
- Classification: `DATABASE_ENVIRONMENT`.

The previously reported aggregate 78 failures and 749 blocked files were not re-used as case-level evidence.

Focused follow-up confirmed the member schema mismatch is intentional schema evolution from migration 120, present in both V11 and V12. The skipped database suite remains blocked because no approved BlessBoard PostgreSQL database was available; the ActiveClinic database was not reused.

Phase 5F recovered the skipped suite onto a newly created owned BB database. Two non-database cases passed; the database case failed at `ensureCanonicalTenantsIfMissing()` because `public.tenants` does not exist after the supported V12 migration sequence. This is recorded as a fixture/schema-environment blocker with raw TAP evidence, not as a product defect.

## Phase 5G canonical schema follow-up

The supported `scripts/apply-test-db-schema.js` bootstrap was executed against
the separately created `getpro_v212_bb_test_ephemeral_202610310942` database.
It created `public.tenants` and eight canonical rows. The focused suite was
rerun with TAP capture:

- 3 cases: 2 pass, 1 fail, 0 skip
- `public.tenants` was successfully resolved
- remaining first failure: second `createBranch` fixture with duplicate
  `host_slug = "main"`; PostgreSQL error `23505` on
  `idx_church_branches_host_slug_unique`

The migration and affected test are identical in V11 and V12. The remaining
issue is a test-fixture contract mismatch with the supported global host-slug
uniqueness rule, not a confirmed product regression. Raw evidence is stored at
`/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5g-branch-announcements-events.tap`.

## Phase 5H fixture recovery

The isolated test fixture was corrected to provide unique run-scoped
`host_slug` values for both branches while retaining the application slug
`main`. The original management assertions executed and passed: 3/3 cases,
0 failures, 0 skips. An independently provisioned database
`getpro_v212_bb_test_ephemeral_202610310943` produced the same 3/3 result.
No product runtime, migration, index, tenant identifier, or assertion changed.
