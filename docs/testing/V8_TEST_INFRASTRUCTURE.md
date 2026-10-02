# V8 Test Infrastructure

Reusable automated gates for BlessBoard + ActiveClinic on the shared V7 PostgreSQL database.

## Framework

- **Runner:** Node.js built-in `node --test` (same as V7). Do not introduce Mocha/Jest.
- **Fixtures:** `tests/helpers/foundationDb.js` creates disposable local databases (`blessboard_ft_*`). Destructive resets never target hosted `DATABASE_URL`.
- **Branch:** All V8 gate work lands on `V8` only.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run test:v8:regression` | Single V8 regression gate (shared → compatibility → BB → AC) |
| `npm run test:v8:regression:coverage` | Regression + ≥90% line coverage on modified shared modules |
| `npm run test:v8:suite -- <id>` | One suite: `shared-platform`, `compatibility`, `blessboard`, `activeclinic` |
| `npm run test:v8:coverage` | Coverage gate only |
| `npm run test:v8:hosted-smoke` | Optional hosted smoke (`V8_SMOKE_BASE_BB` / `V8_SMOKE_BASE_AC`) |
| `npm run test:v8:db-compat` | DB compatibility baseline |
| `npm run test:v8:env-isolation` | Environment / deployment isolation |
| `npm run test:v8:migration-contract` | Shared migration contract |
| `npm run test:v8:tenant-isolation` | Cross-product tenant isolation |

List suites: `node scripts/v8/run-suite.js --list`.

## Suites

1. **shared-platform** — hostname resolution, deployment profiles, sessions, env validation.
2. **compatibility** — V8 DB contract, migration contract, runtime schema, tenant + product isolation, V8 env isolation.
3. **blessboard** — curated BB static + auth/authorization regression files.
4. **activeclinic** — curated AC V7 automated regression file list.

Manifest: `scripts/v8/suite-manifest.js`.

## Coverage target

- **≥90% line coverage** on modules listed in `COVERAGE_TARGETS` (V8-modified shared-platform files).
- **Branch coverage is reported** (not a hard fail threshold unless raised later with evidence).
- Tool: `c8` (`devDependency`).

### Justified exclusions (not in the 90% line gate)

| Module | Reason |
| --- | --- |
| `src/platform/http/moovexPlatformRuntimeServer.js` | Large product-bootstrap / QA admin surface; `/healthz` + hosted smoke cover deployment isolation. |
| `src/platform/media/hostingerMediaConfig.js` | Hostinger FS probes need durable roots; write-namespace rules covered in `v8-environment-isolation`. |

Do **not** weaken thresholds or add exclusions merely to report PASS.

## Feature test expectations

Every subsequent V8 feature must add tests for:

- Successful operation
- Invalid input / failure handling
- Authentication and authorization
- Tenant and product isolation
- Data persistence and V7 compatibility
- Relevant regression behavior

## Hosted smoke (optional)

```bash
V8_SMOKE_BASE_BB=https://blessboard.neuniversity.org \
V8_SMOKE_BASE_AC=https://activeclinic.neuniversity.org \
npm run test:v8:hosted-smoke
```

Read-only `/healthz` checks. Exit `2` = not configured (skip). Never migrates or deletes data.

## Safety

- Never `DROP`/`TRUNCATE` hosted V7 testing or production data from these gates.
- Prefer temporary schemas / disposable DBs for destructive cases.
- V8 shares identity `moovex-platform-v7` / `testing` with V7; isolation is process/host/cookie/media — not a separate database.
