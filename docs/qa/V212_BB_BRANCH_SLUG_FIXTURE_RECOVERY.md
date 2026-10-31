# V2.12 BlessBoard branch fixture collision recovery

## Safety

- V12 HEAD: `07f4fcdfd9f7ab22585b59e3cbebf608b4569687`
- Docker context/network: `colima-v212-qa` / `v212-qa-internal`
- Database: `getpro_v212_bb_test_ephemeral_202610310942`
- Database ownership: dedicated synthetic QA database created for this run
- ActiveClinic database: untouched
- No production endpoints or credentials used
- No database reset, migration rewrite, or runtime change

## Collision evidence

Read-only PostgreSQL inspection returned:

```text
CREATE UNIQUE INDEX idx_church_branches_host_slug_unique
ON public.church_branches USING btree
(lower(TRIM(BOTH FROM host_slug)))
WHERE (TRIM(BOTH FROM host_slug) <> ''::text)
```

The first failed execution left this row in the disposable database:

```text
organization_id=1, organization_slug=ae_a_ae_1793432580830_hx93ms,
slug=main, host_slug=main
```

The test creates both branch fixtures with `slug: "main"` and omits
`host_slug`. `branchesRepo.createBranch()` defaults `host_slug` to `slug`, so
the second insert attempts another global `host_slug=main`. The index is
global, not tenant-scoped. The conflicting row was created by the prior test
setup, not by canonical tenant bootstrap.

V11 and V12 contain byte-identical versions of the affected test and
`db/postgres/072_church_branch_host_slug.sql`.

## Test-only remedy

The isolated QA copy of
`tests/church-branch-announcements-events.test.js` now supplies deterministic,
run-scoped host slugs:

- `ae_a_${suffix}`
- `ae_b_${suffix}`

The branch application slug remains `main`; only the externally unique host
slug is made explicit. Product runtime files, migrations, indexes, tenant IDs,
and assertions were unchanged.

## Execution

First patched run on the existing dedicated database:

- 3 tests
- 3 passed
- 0 failed
- 0 skipped
- Raw TAP: `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5h-first-rerun-patched.tap`

The original assertions executed, including announcement creation/retrieval,
event management, ownership, and branch scoping.

Repeatability run used a separate newly created database
`getpro_v212_bb_test_ephemeral_202610310943`, with the supported canonical
bootstrap and the same isolated test-only fixture:

- 3 tests
- 3 passed
- 0 failed
- 0 skipped
- Raw TAP: `/private/tmp/v212-bb-qa-output/docs/qa/v212/bb/raw/phase5h-second-rerun.tap`

The recovery is therefore a test-fixture correction. No product defect was
confirmed.
