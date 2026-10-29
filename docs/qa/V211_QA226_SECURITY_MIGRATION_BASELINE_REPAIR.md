# V211-QA226 Security Migration Baseline Repair

Date: 2026-10-29  
Branch: `qa/v211-qa226-security-baseline-repair`  
Base V11: `8833e51657a3d104cec0f6bb54234665a4afa656`

## Root cause

The failure was a stale canonical ceiling expectation, not a security
assertion failure and not a database defect.

`tests/v203-critical-platform-security.test.js` called
`verifyCanonicalFreshSchema()`. The baseline metadata expected:

```text
blessboard 128 / 128_canonical_hq_website_scope_ref.sql
```

The ordered migration inventory on disk contains two subsequent V2.11
BlessBoard migrations:

```text
129_member_portal_invitations.sql
130_member_portal_invitations.sql
```

The actual ceiling was therefore:

```text
blessboard 130 / 130_member_portal_invitations.sql
```

The numbers `128/128` and `130/130` are version/filename ceiling pairs, not
security assertion counts, schema counts, or test totals.

## Migration comparison

| Entry | Introduction | Role | Canonical status | V2.11 |
|---|---|---|---|---|
| `128_canonical_hq_website_scope_ref.sql` | prior V2.11 baseline history | BlessBoard HQ website scope | Required marker and ordered | Required |
| `129_member_portal_invitations.sql` | `86876b27` | BlessBoard member portal invitations | Ordered and unique by module/version | Required |
| `130_member_portal_invitations.sql` | `3df272ba` | Follow-up member portal invitation/activation development | Ordered and unique by module/version; distinct contents/checksum | Required |

The two entries have different migration versions and different checksums.
They are not duplicate migration keys. Their identical stem is a naming
quality concern, but deleting, renaming, or reordering either migration would
be unsafe and was not done.

## Repair

Test-only baseline metadata now derives the BlessBoard canonical ceiling as
`130_member_portal_invitations.sql`. The security test expectation was updated
from `128` to `130` and now also asserts that all required migration markers
are present.

Changed files:

- `db/scripts/lib/canonicalMigrationBaseline.js` — baseline metadata only.
- `tests/v203-critical-platform-security.test.js` — stale expectation and
  required-marker assertion.
- `docs/qa/V211_QA226_SECURITY_MIGRATION_BASELINE_REPAIR.md` — this report.

No runtime route, authentication, authorization, CSRF, tenant-isolation,
security policy, migration SQL, database, Hostinger, or production file was
changed.

## Verification

Previously failing test:

```text
node --test tests/v203-critical-platform-security.test.js
```

Result after repair: **PASS**.

Security and migration regression:

- `tests/v203-critical-platform-security.test.js`: 37 tests/pass suites
  including the foundation write-isolation suite.
- `tests/v7-runtime-schema-compatibility.test 2.js`: PASS.
- `tests/blessboard-foundation-schema-status.test.js`: PASS.
- Combined security/migration command: **59 pass, 0 fail, 0 skip**.

Full regression:

- ActiveClinic: **108 pass, 0 fail, 0 skipped**.
- BlessBoard relevant regression: **274 pass, 0 fail, 5 skipped**.
- Build: **PASS**.
- `git diff --check`: **PASS**.

The skipped BlessBoard tests are the suite's pre-existing five documented
skips. No failure was converted into a skip.

## QA223/QA224 review

QA223's mixed closure file was not promoted wholesale because several tests
are source-contract checks rather than complete workflows. The clean
render-only candidate from QA225 remains eligible for a later promotion after
review.

QA224's mutation harness proved three lower-level mutations caught
(M01/M02, M03 and M05), but remains experimental and was not promoted. The
other seven mutation scenarios remain unproven because they require approved
database/browser fixtures.

Coverage remains unchanged from QA224:

- Fully covered: 39.
- Partially covered: 20.
- Missing: 8.

## Promotion

This branch contains only the test-only baseline repair and this QA report.
V11 was not modified. The branch is ready for review; promotion to V11 should
use a reviewed normal cherry-pick after confirming the migration naming policy.

Hosted authenticated browser acceptance remains incomplete.
