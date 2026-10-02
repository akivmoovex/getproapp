# V2.03 QA — Coverage Harness (QA03)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_COVERAGE_HARNESS` |
| **Date** | 2026-09-27 |
| **Prerequisite** | [QA02 Test Inventory](./V2_03_TEST_INVENTORY.md) |
| **Verdict** | **`V203_COVERAGE_HARNESS_PASS`** |

---

## Provider decision

| Option | Status |
|--------|--------|
| Test runner | **Node.js built-in** (`node --test`) — unchanged |
| Native `--experimental-test-coverage` | Available on Node 22; **text-only** (no JSON / LCOV) |
| **c8** (devDependency `^10.1.3`) | **Selected** — already used by `test:v8:coverage`; wraps V8 coverage for `node --test` |
| Jest / Mocha / nyc | Not introduced (no second framework) |

**Coverage provider: `c8`**

---

## Commands

```bash
# Full default suite (tests/**/*.test.js) → coverage/v203/
npm run test:coverage

# Product / shared-platform scopes
npm run test:coverage:platform      # → coverage/v203-platform/
npm run test:coverage:blessboard    # → coverage/v203-blessboard/
npm run test:coverage:activeclinic  # → coverage/v203-activeclinic/

# QA01 critical pack (recommended reproducible measure)
npm run test:coverage:critical      # → coverage/v203-critical/
```

Equivalent:

```bash
node scripts/coverage/run-v203-coverage.js --scope=critical
```

---

## Outputs (per scope)

Under `coverage/v203[-scope]/` (gitignored):

| Artifact | Format |
|----------|--------|
| stdout | Human-readable c8 table + text-summary |
| `coverage-summary.json` | JSON summary |
| `coverage-final.json` | Full JSON |
| `lcov.info` + `lcov-report/` | LCOV + HTML |
| `v203-coverage-meta.json` | Harness metadata (provider, scope, totals, exit codes) |

**No coverage thresholds** are enforced (QA03). Harness PASS = reports written successfully. Individual test failures do not fail the harness.

---

## Include / exclude

**Include (application source):** `src/**`, `server.js`, `server.legacy.js`, `index.js` (product scopes narrow include to product trees).

**Exclude** (via `.c8rc.json`): `node_modules`, `tests`, `coverage`, `docs`, migration/seed SQL, `db/scripts`, tooling `scripts/`, Storybook output, `public/build|uploads|images|fonts|data`, images/fonts binaries, vendor, Playwright reports, config/docs/CSS/EJS (non-JS).

Difficult runtime source under `src/` is **not** excluded to inflate percentages.

---

## QA03 execution evidence

```text
npm run test:coverage:critical
→ HARNESS_PASS scope=critical
→ provider=c8 runner=node --test
→ reports: coverage/v203-critical/{coverage-summary.json,coverage-final.json,lcov.info,v203-coverage-meta.json}
→ observed totals (critical pack, no threshold): lines 44% · statements 44% · functions 36.06% · branches 48.97%
→ testExitCode=1 (known suite failures allowed; harness still PASS)
```

---

## Marker

```text
V203_COVERAGE_HARNESS_PASS

provider: c8
runner: node --test
commands:
  npm run test:coverage
  npm run test:coverage:platform
  npm run test:coverage:blessboard
  npm run test:coverage:activeclinic
  npm run test:coverage:critical
```
