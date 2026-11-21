# V2.13.1 G16 — change inventory

Branch `V13`. Before this commit, local HEAD and `origin/V13` were both `97f31f0791d0493c23b24c8eb026f77102c47dd7`. `main` was `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. Fetch did not move either remote. The branch was not diverged (`0 0`). No reset, stash, rebase, or force-push was used.

## Classification

| Class | Files |
| --- | --- |
| ActiveClinic source | `activeClinicClinicalService.js`, `clinicalOperationsRules.js`, `activeClinicRecordMigrationService.js`, `create-laboratory-request-content.ejs` |
| BlessBoard source | None |
| Shared platform source | None |
| Unit/contract tests | `tests/v13/unit/g02` through `g07` and `g09-g12`; `tests/v13/contract/g02` through `g07` and `g09-g15`; updates to `d18` and `d19` |
| HTTP integration tests | `g03`, `g04`, `g05` integration files and `v13AuthorizedScenarios.js`. They stay gated and were not executed |
| Playwright tests | `v13-ac-platform-qa.spec.js` adds unrun denial checks |
| Database migrations | `043_record_migration_inventory.sql` only. Not executed |
| QA documentation | `docs/qa/V2131_G01` through `V2131_G17` |
| Configuration | None |
| Generated artifacts | None |
| Secrets or private data | None in the reviewed set |

Excluded and not staged:

- `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` — earlier note that the first controller had no prompt bodies. Superseded by the G08 audit.
- `.v13-isolated-pg/`, credentials, logs, and browser output are gitignored and were not staged.

## Feature groups

| Group | In this diff | Release class |
| --- | --- | --- |
| Existing V2.13.1 regression fixes | Already in `97f31f07`. This diff does not remove them | QA_CANDIDATE_READY |
| Laboratory priority and reason | Form and stored urgency check | IMPLEMENTED_UNVERIFIED |
| Prescription dose fields and catalogue handoff | Validation plus optional queue row | PARTIAL |
| Pharmacy and billing behavior | No new prices or processors. Existing services unchanged except the prescription handoff | IMPLEMENTED_UNVERIFIED |
| Medical records | New service and migration 043. Service is not mounted on a route | MIGRATION_PENDING |
| BlessBoard completion | Tests and reports only | IMPLEMENTED_UNVERIFIED |
| Shared platform security | Contract tests only. No restore tool added | IMPLEMENTED_UNVERIFIED |
| Test infrastructure | Safe tests plus gated files | QA_CANDIDATE_READY |

No new feature flag was added. Public booking stays disabled. Media uploads stay fail-closed. The migration service stays unrouted, so the unapplied tables are not required for the current HTTP routes.
