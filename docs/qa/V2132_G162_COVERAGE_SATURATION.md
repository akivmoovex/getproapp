# G162 coverage saturation

Counts are the major workflows in `V2132_G151_COMPLETE_FUNCTIONALITY_INVENTORY.md`. They are not the raw assertion count and they are not the sum of two runs.

| Measure | Value |
| --- | --- |
| ROUTES_TOTAL | 38 feature rows in the inventory |
| ROUTES_WITH_RELEVANT_TEST | 36. Consultation sign and stocked dispense have older service or denial tests, not a v13 success-path browser test |
| MAJOR_JOURNEYS_TOTAL | 38 |
| MAJOR_JOURNEYS_BROWSER_COVERED | 34 |
| MAJOR_JOURNEYS_HTTP_COVERED | 32 passing HTTP tests, plus 3 executed failures |
| MAJOR_JOURNEYS_PERSISTENCE_VERIFIED | 12 read-backs listed in the persistence note |
| QA_BUGS_TOTAL | 36 |
| QA_BUGS_COVERED | 32 |
| CRITICAL_SECURITY_GATES_TOTAL | 8 |
| CRITICAL_SECURITY_GATES_VERIFIED | 7. The unverified gate is live OTP verification, which cannot run without the challenge table |

Browser files executed twice: ActiveClinic 28, BlessBoard 23. Those files contain the 34 covered browser journeys plus role-denial checks that sit inside the same journeys. Unrun tests are not counted.

## Remaining gaps

| Mark | Item | Action |
| --- | --- | --- |
| MIGRATION | D14C, D16, AC-FU-PORTAL-04 | Recorded. Not retried. |
| POLICY | D25 slot, public booking, public self-registration, binary upload | Recorded. Tests assert the disabled or blocked behavior. |
| EXTERNAL | Resend verification and live email | Recorded. DNS was read. No key. |
| IMPLEMENTED_WITHOUT_BROWSER_TEST | Consultation sign | Route exists. No note was created in the browser. |
| IMPLEMENTED_WITHOUT_BROWSER_TEST | Stocked dispense | Denial and queue copy are covered. A stocked confirm was not run. |

No further P0 test can be added without a migration, an approved capacity, or a Resend key. The two P1 browser gaps need a consultation fixture and a stock batch. Those were not invented in this cycle. Saturation for authorized work is reached at that boundary.

Machine-readable copy: `docs/qa/V2132_G162_MACHINE_READABLE_MATRIX.json`.
