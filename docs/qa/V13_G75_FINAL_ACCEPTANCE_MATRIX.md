# V13 G75 final acceptance matrix

Counts are unchanged because the new notice and preview do not finish a partial requirement and no HTTP or browser test was executed.

ActiveClinic: 30 total, 16 `IMPLEMENTED_UNVERIFIED`, 7 `PARTIAL`, 6 blocked, 1 `DEFERRED`.

BlessBoard: 17 total, 13 `IMPLEMENTED_UNVERIFIED`, 3 `PARTIAL`, 1 blocked, 0 deferred.

No row is `VERIFIED_E2E`. `NOT_RUN` is not counted as a pass.

| ID | Status | Evidence this pass | Remaining blocker |
| --- | --- | --- | --- |
| AC-01 to AC-05, AC-07 to AC-10, AC-15, AC-16, AC-20 to AC-24 | IMPLEMENTED_UNVERIFIED | Prior source and safe tests | HTTP and browser `NOT_RUN` |
| AC-06, AC-11, AC-17 | PARTIAL | No new policy | Policy or deferred binary storage |
| AC-12 | PARTIAL | Queue notice and unit test | No approved picker. G67 browser `NOT_RUN` |
| AC-13 | PARTIAL | Preview does not persist | Migration 044 and clinic thresholds |
| AC-14 | PARTIAL | Dispense guards unchanged | Catalogue handoff |
| AC-18, AC-19 | BLOCKED / PARTIAL | 043 still unapplied | Migration and legal policy |
| AC-25, AC-26, AC-27, AC-30 | BLOCKED | Not executed | Test authorization |
| AC-28 | BLOCKED | No contract | Policy |
| AC-29 | DEFERRED | Unchanged | Approved deferral |
| BB-01 to BB-05, BB-07 to BB-10, BB-12, BB-14, BB-15, BB-17 | IMPLEMENTED_UNVERIFIED | Unchanged | HTTP and browser `NOT_RUN` |
| BB-06 | PARTIAL | No fixture inserted | Public-page rows |
| BB-11 | PARTIAL | Uploads remain off | Enablement decision |
| BB-13 | PARTIAL | No module added | Approved deferral of a new module |
| BB-16 | BLOCKED | Not executed | Test authorization |

Security review of this pass: no default clinical range, no automatic medication, no document deletion, no billing change, no tenant-scope change, no public-booking change, and no media-upload change.
