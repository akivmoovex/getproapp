# G174 coverage saturation

Counts are major workflows, not assertions, and not the sum of two runs.

| Measure | Value |
| --- | --- |
| MAJOR_JOURNEYS_TOTAL | 38 |
| MAJOR_JOURNEYS_BROWSER_COVERED | 35 |
| MAJOR_JOURNEYS_HTTP_COVERED | 32 passing HTTP tests, plus 3 executed failures |
| MAJOR_JOURNEYS_PERSISTENCE_VERIFIED | 13 |
| QA_BUGS_MAPPED | 36 |
| QA_BUGS_VERIFIED | 32 |
| P0_GAPS | 0 actionable |
| P1_GAPS | 1 |

The new browser journey closes the consultation draft, sign-on-complete, and cross-clinic denial gap. Persistence is the note row and the pharmacy count.

## Run 1

Safe 572/570/0/2. HTTP 35/32/3. ActiveClinic 29 passed. BlessBoard 23 passed.

## Run 2

Safe 572/570/0/2. HTTP 35/32/3. ActiveClinic 29 passed. BlessBoard 23 passed.

The three HTTP failures are D14C, D16, and D25 slot capacity. Overlap passed both times.

## Remaining

| Gap | Class | Why it stops here |
| --- | --- | --- |
| OTP challenge row | MIGRATION | Table absent. Tests still fail. |
| Slot capacity | POLICY | No approved integer. Test still fails. |
| Live Resend send | EXTERNAL | No account and no API key. |
| Stocked dispense | P1 | Route exists. This cycle proved the no-catalogue boundary. A stock batch was not invented. |

No further safe P0 test can be added under the current authorizations. The stocked-dispense P1 needs an approved inventory fixture.

Machine copy: `docs/qa/V2132_G174_COVERAGE_MATRIX.json`.
