# BlessBoard V5 — Test fixture consistency audit

**Date:** 2026-07-19  
**Scope:** V5 test helpers, fixture factories, seed-like utilities, role/user/church/branch/domain setup patterns  
**Companions:** [`V5_TEST_FAILURE_TRIAGE.md`](./V5_TEST_FAILURE_TRIAGE.md) · [`V5_SKIPPED_TEST_AUDIT.md`](./V5_SKIPPED_TEST_AUDIT.md) · [`V5_TEST_COMMAND_CATALOGUE.md`](./V5_TEST_COMMAND_CATALOGUE.md)

**Policy applied:** Safe test-helper improvements only. No runtime changes to match bad fixtures. No mega-global fixture. No opaque mocks. No hosted database dependencies.

---

## 1. Helpers reviewed

| Helper | Role | V5 relevance |
|--------|------|--------------|
| `tests/helpers/foundationDb.js` | Ephemeral local Postgres (`blessboard_ft_*`), pool, soft-skip reason | **Primary** V5 DB fixture |
| `tests/helpers/blessboardV5Fixtures.js` | **New** thin constants + `makeTenant` / `baseV5TestEnv` / cookie helpers | **Primary** shared V5 tenant context |
| `tests/helpers/migrationFixtureDb.js` | Dual local DBs + **intentional** V4 `public.tenants` schema | Migration tooling only (not V5 app) |
| `tests/helpers/pgTestSeed.js` | Canonical V4 church tenants | **Not** V5 foundation (church-pilot / V4) |
| `tests/helpers/churchPilotSmokeFixtures.js` | Pilot smoke orgs/branches | **Not** V5 foundation |
| `tests/helpers/churchPgTest.js` / `churchPlanQueryCounter.js` | Church PG helpers | Out of V5 fixture scope |

**No pre-existing shared V5 builder** existed before this audit. Suites duplicated:

- `provisionPlatformTenant` + `provisionBlessBoardChurch` + `createBlessBoardUser` + `assignBlessBoardRole`
- Local `makeTenant(church, org, primaryBranch)` copying UUID ids into a resolved tenant object
- Local `baseEnv` with `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5` + long `SESSION_SECRET`
- Local cookie extract/join helpers

Runtime provision services remain the source of truth for org/church/branch rows; tests correctly call them rather than inserting opaque fake graphs.

---

## 2. Checklist findings

### Inconsistent organization / church / branch relationships

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Local `makeTenant` set **both** `primaryBranch` and `hqBranch` to the campus id when building campus-scoped tenants | Medium (fidelity) | **Corrected** — pass HQ as 4th arg / `hqBranch` |
| Org ↔ church links generally come from `provisionBlessBoardChurch` with matching `organizationKey` + `dataEnvironment: "testing"` | OK | Retain |
| Cross-tenant isolation suites provision a second org (att-b, giv-b, …) with separate keys/hosts | OK | Retain |

### Invalid environment combinations

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Happy-path suites use `deploymentCode: "blessboard-org-v5"` + `dataEnvironment: "testing"` | OK | Matches V5 env pairing |
| Some suites intentionally use `dataEnvironment: "production"` (routing / public-pages / provisioning mismatch cases) | OK | Documented negative cases — not fixture bugs |
| `tenant-auth` probes `blessboard-com-v4` deployment | OK | Explicit isolation / deny case |

### Duplicated role setup

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Nearly every HTTP suite repeats create-user + `assignBlessBoardRole` for hq / branch / member / platform_admin | Low (DRY) | **Not** collapsed into a mega-seed; roles stay explicit per suite |
| Role grants always use UUID `organizationId` / `churchId` / `branchId` from provisioned rows | OK | Retain |

### Stale package names / plan keys

| Finding | Severity | Disposition |
|---------|----------|-------------|
| V5 seed / PA UI assert `free`, `growth`, `professional`, `partner` | Info | Matches **current** `platform.plans` seed — not a fixture bug |
| Approved future vocabulary (`foundation` / `growth` / `network`) not yet migrated | Info | Tracked under plan-key migration docs — **do not** retarget fixtures ahead of runtime |
| V4 church suites use `plan_code` `foundation`/`growth`/`free` aliases | Out of V5 app scope | Ignore for V5 fixtures |
| `migrationFixtureDb` DEFAULT `plan_code='free'` while seed row uses `'growth'` | Info | Intentional V4-shaped variety; comment clarified |

### Fake legacy tenant IDs / `public.tenants` / `public.session`

| Finding | Severity | Disposition |
|---------|----------|-------------|
| V5 suites assert paths **never** query `public.tenants` / `public.session` | OK | Isolation checks, not fixture dependencies |
| `migrationFixtureDb.installMinimalV4Schema` creates `public.tenants` | OK | V4 **source** for migration tests only; comment strengthened |
| Auth/catalogue schema tests assert `to_regclass('public.tenants')` is null on foundation DBs | OK | Correct |

### Domain mappings

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Hostnames are unique per suite (`att-a.blessboard.org`, …) and passed into `provisionPlatformTenant` | OK | Retain |
| Domain type `canonical` + `isPrimary: true` is the common pattern | OK | Retain |

### Active / inactive states

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Provisioned orgs/churches/branches default active; inactive cases are explicit test mutations | OK | Retain |

### Display names vs UUID relationships

| Finding | Severity | Disposition |
|---------|----------|-------------|
| `blessboard-authorization.test.js` uses `organizationId: "demo-church"` / `churchId: "Demo Church"` | OK | **Negative** case — asserts grants do not match by display name |
| Happy-path `makeTenant` used UUID `org.id` / `church.id` / `branch.id` | OK | Enforced in shared helper via `assertUuidId` |
| Display names appear only on `church.displayName` (presentation), not as ids | OK | Shared helper preserves this |

### Fixtures bypassing deployment scoping

| Finding | Severity | Disposition |
|---------|----------|-------------|
| Most suites pin `deploymentCode: "blessboard-org-v5"` | OK | Retain |
| Authorization suite provisions `other-authz-v5` for cross-deployment deny | OK | Intentional |
| No suite was found inventing tenant context without going through provision + UUID ids for write paths | OK | — |

---

## 3. Fixtures / helpers corrected

1. **Added** `tests/helpers/blessboardV5Fixtures.js`
   - Constants: `V5_DEPLOYMENT_CODE`, `V5_IDENTITY_KEY`, `V5_DATA_ENVIRONMENT`, session secret
   - `baseV5TestEnv(overrides)`
   - `makeResolvedTenantContext` / `makeTenant(church, org, primary[, hq])` with UUID checks
   - Cookie extract/join helpers
2. **Wired** shared helper into:
   - `blessboard-attendance.test.js`
   - `blessboard-giving.test.js`
   - `blessboard-forms-requests.test.js`
   - `blessboard-announcements.test.js`
   - `blessboard-participation.test.js`
   - `blessboard-reports-audit.test.js`
3. **Fixed** campus tenant contexts so `hqBranch` remains the church HQ while `primaryBranch` is the campus
4. **Clarified** `migrationFixtureDb.js` header: V4-only `public.tenants`, not a V5 app fixture
5. **Added** `tests/blessboard-v5-fixtures.test.js` (no DB) for helper contracts; included in `test:blessboard:precommit-fast` / `npm run test:blessboard:v5-fixtures`

**Not done (by design):** rewriting every remaining blessboard suite onto the shared helper; building one global seed; changing runtime plan keys / provision defaults.

---

## 4. Runtime behavior

**Unchanged.** No edits under `src/`, `db/`, or server entrypoints for this audit.

---

## 5. Remaining duplication (accepted)

Suites still inline their own `provisionPlatformTenant` / church / user / role graphs. That duplication is **preferable** to a hidden mega-fixture: each suite’s org keys, hosts, and roles stay readable. Prefer gradual adoption of `blessboardV5Fixtures` for `makeTenant` / `baseEnv` only.

V4 helpers (`pgTestSeed`, `churchPilotSmokeFixtures`) must not be imported by V5 foundation suites.

---

## 6. Exact test results (this audit)

| Command | Result |
|---------|--------|
| `node --test tests/blessboard-v5-fixtures.test.js` | **6 pass / 0 fail** |
| `node --test` attendance + giving + reports-audit + participation | **34 pass / 0 fail** |
| `node --test` forms-requests + announcements | **29 pass / 0 fail** |
| `npm run test:blessboard:v5:regression:fast` | **176 pass / 0 fail** (includes new fixtures unit file in `precommit-fast`) |

---

## 7. Suggested follow-ups (out of scope)

- Migrate remaining blessboard HTTP suites to `baseV5TestEnv` / `makeTenant` when next touched
- After plan-key migration ships, update PA assertions and document seed vocabulary in one place
- Optional thin `createUserWithRoles(pool, …)` wrapper — only if it stays explicit (no silent role bags)

---

## 8. Suggested commit message

```
test(v5): align tenant fixtures and audit helper consistency

Share UUID-safe makeTenant/baseEnv helpers, keep campus hqBranch distinct from primary, and document fixture inventory.
```
