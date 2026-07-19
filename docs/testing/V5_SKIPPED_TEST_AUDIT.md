# BlessBoard V5 — Skipped / conditional test audit

**Date:** 2026-07-19  
**Scope:** BlessBoard V5 + platform foundation / migration suites that gate on local Postgres  
**Companions:** [`V5_TEST_FAILURE_TRIAGE.md`](./V5_TEST_FAILURE_TRIAGE.md) · [`V5_TEST_COMMAND_CATALOGUE.md`](./V5_TEST_COMMAND_CATALOGUE.md)

**Policy applied:** No fabricated fixtures, no production connections, no credentials, no shallow mocks replacing integration coverage, no skip used to hide defects. Soft skips only when local foundation Postgres cannot be provisioned; messages must name the dependency.

---

## 1. Inventory method

Searched V5-related tests (`tests/blessboard*`, `tests/v5*`, `tests/platform-v5*`, platform entitlements/hostname/provisioning/diagnostic, `migration-*`, `db-foundation*`, `db-bootstrap*`) for:

- `it.skip` / `describe.skip` / `test.skip` / `.todo(` / `.only(`
- `t.skip(`
- `skipSuite` + soft skip vs fail-loud

**Hardcoded permanent skips / todos:** **none** in V5 suites.  
**Package scripts:** no skip/todo flags.

---

## 2. Classification summary

| Class | Count (pattern) | Action |
|-------|-----------------|--------|
| **REQUIRES DATABASE** (soft `t.skip`) | 9 suites · many cases each | Retained; skip reason made explicit |
| **REQUIRES DATABASE** (fail-loud `assert.fail`) | ~30 suites | Retained (not a skip — suite fails if Postgres missing) |
| **VALID ENVIRONMENT SKIP** | Same as soft DB skips | Retained |
| **REQUIRES HOSTED SERVICE** | 0 in automated V5 unit/integration | Hosted smoke is manual (catalogue) |
| **REQUIRES FUTURE FEATURE** | 0 test skips | Product omissions are untested by design (prayer, payments) — not skipped tests |
| **STALE SKIP** | 0 | Nothing removed |
| **UNJUSTIFIED** | 0 after message fix | Vague `setup failed:` was unjustified **wording** only |

---

## 3. Soft skips (node:test `t.skip`) — audited

These suites call `skipIfNeeded(t)` when `resetFoundationDatabase()` / migrate / provision fails in `before()`.

| Test | Reason | Required dependency | Risk | Recommended action |
|------|--------|---------------------|------|--------------------|
| `tests/blessboard-attendance.test.js` — all cases via `skipIfNeeded` | Local foundation Postgres setup failed | Local Postgres + admin create-DB rights (`FOUNDATION_ADMIN_DATABASE_URL` optional) | Soft skip can look “green” if CI omits Postgres and only runs these files | Keep soft skip; **explicit** `REQUIRES DATABASE:…` reason (updated). Prefer full regression on machines with Postgres |
| `tests/blessboard-announcements.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-forms-requests.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-giving.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-media.test.js` — via `skipIfNeeded` | Same (uses **local filesystem** storage; does not call hosted Supabase) | Same | Same | Same — not a hosted-service skip |
| `tests/blessboard-member-portal.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-member-registration.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-participation.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |
| `tests/blessboard-reports-audit.test.js` — via `skipIfNeeded` | Same | Same | Same | Same |

**Skip message (shared helper):** `foundationDbUnavailableSkipReason(detail)` in `tests/helpers/foundationDb.js`:

```text
REQUIRES DATABASE: local PostgreSQL foundation fixture unavailable (…).
Start local Postgres (or set FOUNDATION_ADMIN_DATABASE_URL); this skip is not a product pass.
```

**Classification:** **REQUIRES DATABASE** / **VALID ENVIRONMENT SKIP**  
**Stale skips removed:** none (no permanent skips existed)  
**Unjustified:** opaque `setup failed:` wording — **fixed** (not removed)

---

## 4. Fail-loud DB gates (not skips)

When setup fails, these suites set `skipSuite` then **`assert.fail(\`Local PostgreSQL unavailable: …\`)`** on first case — the suite **fails**, it does not skip. Examples: `blessboard-auth-http`, `blessboard-tenant-routing`, `blessboard-authorization`, shells, catalogue, apex-home/marketing, `v5-foundation-startup`, `platform-v5-sessions`, `migration-tooling`, `db-foundation`, etc.

| Test pattern | Reason | Required dependency | Risk | Recommended action |
|--------------|--------|---------------------|------|--------------------|
| `requireDb()` / inline `assert.fail` after failed `before()` | Local foundation DB unavailable | Local Postgres | Red CI without Postgres | **Keep fail-loud** for foundation critical path; document in catalogue |

**Classification:** **REQUIRES DATABASE** (environment failure, not skip)  
Do **not** convert these to soft skips — that would hide missing CI Postgres behind a green skip count.

---

## 5. Non-skip “skip” naming (false positives)

| Location | Note |
|----------|------|
| `blessboard-tenant-routing-mode.test.js` — `apex always skips` | Asserts routing **outcome** `SKIP`, not `t.skip` |
| `migration-mapping.test.js` — “skips passwords” | Mapping rule, not a test skip |
| `blessboard-catalogue-http-context` — “platform context disabled” | Product mode off, test still runs |

---

## 6. Hosted / future / package

| Item | Classification | Notes |
|------|----------------|-------|
| Hosted demo E2E / authoritative smoke | **REQUIRES HOSTED SERVICE** + data fixtures | Manual runbooks — not automated skips |
| `/member/prayer`, payments, etc. | **REQUIRES FUTURE FEATURE** | No skipped tests; features simply untested |
| `npm run lint:css --max-warnings 0` | Out of scope | Catalogue excludes as V5 gate |
| Media suite vs Supabase | Media HTTP tests use local disk storage | Comment in file: never contacts hosted Supabase |

---

## 7. Changes this audit

| Change | Why |
|--------|-----|
| `foundationDbUnavailableSkipReason()` helper | Single explicit skip string |
| 9 soft-skip suites use the helper | Reports readable; not a product pass |
| No skips removed | Cannot run those cases without real local Postgres; fabricating fixtures forbidden |
| No fail-loud → soft skip conversion | Would hide infra failures |

---

## 8. Verification

```text
# Changed soft-skip suites (spot)
node --test --test-concurrency=1 \
  tests/blessboard-attendance.test.js \
  tests/blessboard-media.test.js \
  tests/blessboard-member-registration.test.js
→ expect # fail 0 when local Postgres available

npm run test:blessboard:v5:regression:fast
→ expect PASSED (static; no soft skips in this gate)
```

---

## 9. Risks retained

1. Soft-skip suites can report `# skip N` / green file exit if Postgres is down — mitigated by explicit “not a product pass” wording and fail-loud peers in the full regression chain.  
2. Dual patterns (soft vs fail-loud) remain — intentional: module suites softer; auth/routing/foundation louder. Unifying would be a separate policy decision.  
3. Fixed `FOUNDATION_DATABASE_URL` still unsafe under high concurrency (documented in failure triage).
