# V2.03 QA — Coverage Analyzer (QA04)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_COVERAGE_ANALYZER` |
| **Date** | 2026-09-27 |
| **Prerequisite** | [QA03 Coverage Harness](./V2_03_COVERAGE_HARNESS.md) |
| **Verdict** | **`V203_COVERAGE_ANALYZER_PASS`** |

---

## Command

```bash
npm run test:coverage:analyze
# optional:
node scripts/analyze-test-coverage.js --input coverage/v203-critical
```

Reads QA03 `coverage-summary.json` (default preference: `coverage/v203-critical`, then `coverage/v203`, …).

## Outputs

| File | Purpose |
|------|---------|
| `coverage/coverage-gap-report.json` | Machine-readable aggregates + flagged files |
| `coverage/coverage-gap-report.md` | Human-readable gap report |

## Diagnostic thresholds (not gates)

- lines &lt; 70%
- functions &lt; 70%
- branches &lt; 60%
- or 0% / absent from coverage run

## Marker

```text
V203_COVERAGE_ANALYZER_PASS
```
