# Feature status and gaps

G65–G76 keep the G35 counts. A saved prescription now says when it is not on the pharmacy queue. The laboratory reference-rule page previews a rule and does not store it. Stored clinical thresholds, migration 043, migration 044, media enablement, and production OTP delivery remain unactivated.

| ID | Can continue without a new approval | Why it stays |
| --- | --- | --- |
| AC-06 | Yes, as the current encounter list | No broader continuity policy |
| AC-11 | No | Diagnosis codes would be invented |
| AC-12 | No | The form forbids a catalogue picker |
| AC-13 | No | Reference ranges are not approved |
| AC-14 | Yes, through the existing dispense service | Queue handoff is AC-12 |
| AC-17 | No | Binary storage is deferred |
| AC-18 | No | Migration 043 is not applied and the service is unrouted |
| AC-19 | No | Paper destruction needs legal approval |
| AC-25 | No | Export was not executed |
| AC-26 | No | Offline is 503 and restore is absent |
| AC-27 | No | No accessibility audit |
| AC-28 | No | No monitoring contract |
| AC-29 | No | Deferred interoperability |
| AC-30 | No | No performance test |
| BB-06 | No | Public-page rows are absent |
| BB-11 | No | Uploads stay disabled |
| BB-13 | Yes, as a request category | A new prayer module is unapproved |
| BB-16 | No | Reports were not executed |

Original regression ids, all `IMPLEMENTED_UNVERIFIED` except where noted: AC-REG-01, BB-REG-07, AC-AUTH-04, BB-AUTH-04, BB-MEM-01, BB-MEM-02, AC-WEB-08, AC-WEB-09, BB-WEB-09, BB-WEB-10, BB-ANN-01, AC-REC-02, AC-REC-03, AC-PUB-01. BB-WEB-08 is `PARTIAL`. BB-ANN-02 is `PARTIAL`.

The D28 browser matrix records `TOTAL_BROWSER_ISSUES=9` and lists the later observations: AC-WEB-09, AC-REC-02, AC-REC-03, AC-AUTH-04, AC-PUB-01, BB-MEM-01, BB-MEM-02, BB-ANN-01, BB-ANN-02, BB-WEB-09, BB-WEB-10, and BB-WEB-08. That document’s own total is 9. This file does not renumber it. None of those rows is `VERIFIED_E2E`.
