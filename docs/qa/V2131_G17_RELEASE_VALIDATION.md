# V2.13.1 G17 — release validation

Database-free contract and unit tests, including the security-guard contracts:

```
tests 467
pass 467
fail 0
skipped 0
```

Syntax checks of the changed JavaScript passed in the G15 run. Those files were not edited again before this validation. HTTP, Playwright, bootstrap, fixture writes, migrations, production OTP, and payment calls were not run.

## Regression preservation

| Check | Result |
| --- | --- |
| Sixteen regression fixes | Still in the tree from `97f31f07`. This diff does not delete them |
| Browser source fixes | Theme CSRF, walk-in empty state, triage entry, member fields, sermon and event drafts remain |
| Version | `PRODUCT_VERSION_V8` is `2.13.1` for both products |
| CSRF | Foundation checks remain. No bypass was added |
| OTP | Production still refuses the test provider |
| Tenant and facility | Encounter close, laboratory lookup, and pharmacy catalogue lookup still filter by organization |
| Appointments | `STALE_VERSION` remains |
| Public booking | Not enabled |
| Shared PostgreSQL | Not contacted. The isolation guard tests passed |

## Migration 043

Unique id `043`, after `042`. No `DELETE`, `DROP`, or `TRUNCATE`. New tables only, with organization and facility foreign keys and `ON DELETE RESTRICT`. Existing patient rows are not altered. `matched_patient_id` is nullable. No credentials. Not executed. Features that insert into these tables are `NOT_DEPLOYABLE` until the migration is applied on an authorized database. Current routes do not call that service.

## Clinical and financial safety

No diagnosis threshold, dose rule, tariff, or payment provider was added. Signed notes still cannot be edited. Duplicate open encounters and duplicate active queue rows are still rejected. Critical laboratory flags are stored only when the caller sets them. No certification is claimed.

## Decision

The change set is safe to commit and push as a development QA candidate on `origin/V13`. It is not production-ready. Migration 043 must be applied before any import screen is mounted.

```
QA_CANDIDATE_READY=YES
PRODUCTION_READY=NO
MIGRATIONS_PREPARED=1
MIGRATIONS_EXECUTED=NO
```
