# G209 coverage saturation

The PDF was unavailable, so 190 remains a planning number. `G209_COVERAGE_MATRIX.json` maps 26 prompt requirements. All 26 have an implementation or an explicit blocker. 24 have a passing unit, HTTP, or mock browser execution. 2 are blocked as PostgreSQL or live financial work: `SCHEMA` and the persistence half of `PG-E2E`. The mock browser pass is not counted as PostgreSQL end to end.

Separate counts:

| Count | Value |
| --- | --- |
| Specified scenarios planned | 190 |
| Specified scenarios mapped from the prompt | 26 |
| Implemented | 25 source rows, plus 1 prepared schema |
| Executed passing in unit, HTTP, or mock browser | 24 |
| Blocked | schema persistence and live posting |
| Failed | 0 in the community suites run so far |
| Not run as PostgreSQL | community tables and community HTTP against PostgreSQL |

Browser journeys covered in the mock server: 25 prompt journeys are exercised inside the 7 Playwright tests. HTTP coverage of the real router: enrollment is browser-only; check-in denial, bad code, preview, and flag-off are in `g198`. Persistence of new writes: blocked. Cross-clinic negatives: chart read and wrong-clinic POST. Financial calculation tests: models A, B, and C. Concurrency: one link race. Idempotency: one repeated plan key.

P0 that can be closed without a new approval: none remaining in source. P1 that can be closed without a new approval: none remaining in source. The open gates are the unapproved schema and the unapproved commercial activation.
