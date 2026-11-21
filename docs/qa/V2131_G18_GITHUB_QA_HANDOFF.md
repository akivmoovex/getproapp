# V2.13.1 G18 — GitHub QA handoff

This file is the commit after the feature commit. The feature commit is the parent of this handoff.

| Item | Value |
| --- | --- |
| Branch | `V13` |
| Previous SHA | `97f31f0791d0493c23b24c8eb026f77102c47dd7` |
| Feature SHA | `ccb5859febe2f31f2b92584677977340a09c1ccf` |
| Remote | `origin/V13` only |
| Products | BlessBoard and ActiveClinic `2.13.1` |
| Production ready | No |
| Deployment | Not performed |

## What the feature commit contains

Laboratory requests now keep a stored priority (`routine`, `urgent`, or `stat`) and a reason. An unknown priority is rejected. A prescription must include medication name, dose, frequency, and duration. It reaches the pharmacy queue only with a same-organization catalogue item and a whole-number quantity. Record-import tables are prepared in `043_record_migration_inventory.sql` and were not applied. The import service is not mounted on a route, refuses file bytes, and refuses paper destruction.

BlessBoard and shared-platform behavior were not rewritten. New tests lock the existing member, sermon, event, announcement, OTP, CSRF, appointment, and audit contracts.

## Classification

| Item | Class |
| --- | --- |
| Regression fixes already on `97f31f07` | QA_CANDIDATE_READY, still HTTP and browser NOT_RUN |
| Laboratory priority | IMPLEMENTED_UNVERIFIED |
| Prescription queue handoff | PARTIAL |
| Billing and pharmacy services | IMPLEMENTED_UNVERIFIED |
| Migration 043 | MIGRATION_PENDING and NOT_DEPLOYABLE until applied |
| Media uploads | PARTIAL, flag stays off |
| BlessBoard public pages | PARTIAL, fixture rows absent |
| Enabled booking, coupons, CDS, drug rules | DEFERRED |
| Backup, restore, offline | BLOCKED, not demonstrated |

## Tests

Database-free tests: 467 passed, 0 failed, 0 skipped. HTTP and Playwright were not run. No database was written. Shared PostgreSQL was not contacted.

## Before any deployment

1. Apply `043` only on an authorized database. It has no down script.
2. Do not mount the import service until it checks a permission.
3. Run the gated HTTP and Playwright suites.
4. Leave public booking disabled and media uploads off unless a separate decision enables them.

## Next QA

Run D04, D05, and the two V13 Playwright specs against the isolated database. Then decide the catalogue picker and the public-page fixture write. Do not treat this branch as a production release.
