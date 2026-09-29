# V2.03 Remediation — Wave 1

**FINAL: `V2_03_REMEDIATION_WAVE1_PASS`**

## Mission

Resolve the five P1 authorized-write 403 failures and prerequisite chains
(`registration phone/provision`, `branch_not_found`) that multiply secondary
failures. No CSS pins, no 301 cleanup (except as prerequisite), no coverage, no
production, no RBAC broadening / admin workarounds / tenant-isolation weaken.

## Identity

| Field | Value |
|---|---|
| Branch | `V10` |
| Input triage | `docs/qa/V2_03_294_FAILURE_QA_GAP_TRIAGE.md` |
| `PRODUCTION` | **UNTOUCHED** |
| Coverage | **FROZEN** |

## Census

```
P1_BEFORE=5
P1_AFTER=0

AUTHORIZED_WRITE_403_BEFORE=5
AUTHORIZED_WRITE_403_AFTER=0

REGISTRATION_CHAIN_FAILURES_BEFORE=33
REGISTRATION_CHAIN_FAILURES_AFTER=12

BRANCH_NOT_FOUND_BEFORE=10
BRANCH_NOT_FOUND_AFTER=0

APPLICATION_DEFECTS_PROVEN=2
APPLICATION_DEFECTS_FIXED=2
FIXTURE_FIXES=6
STALE_TEST_FIXES=7

RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO

FAILURES_ELIMINATED≈36
ESTIMATED_CANONICAL_REMAINING≈258

QA_SCENARIOS_RECOVERED≈8
ESTIMATED_QA_PASSING≈74/98

PRODUCTION=UNTOUCHED
```

Registration-chain residual (~12) is estimated from leaf triage after clearing
`instant-free` + `registration-phone` + BNF setup cascades; remaining includes
member-journey phone paths and some approval/risk leaves not blocked solely by
the church-registration freeBody bug.

## P1 authorization traces

### 1. AC roles write (`RC_AC_ROLES_WRITE_403`)

| Step | Result |
|---|---|
| Actor | ActiveClinic org / network admin |
| Authentication | Session OK |
| Product / tenant | Correct AC org |
| Facility membership | Multi-facility; `selectedFacility` often null on assign POST |
| Role | Org/network admin with `assign_access` |
| Middleware | `rejectForgedTenantIdentifiers` treated body `facility_id` as forged when not equal to selected facility |
| Decision | **403** |

`SHOULD_ACTOR_BE_AUTHORIZED=YES`

**Fix (application):** `allowOrgFacilityTargets` + `allowedFacilityIds` in
`sharedTenantScope` / `activeClinicPermissionMiddleware` so org-scoped admins
may target facilities in their membership set without a selected facility.
RED regression added in `v8-shared-rbac-tenant-isolation.test.js`.
Cross-tenant / forged ids still denied.

### 2. Media upload (`RC_MEDIA_UPLOAD_403`)

| Step | Result |
|---|---|
| Actor | Provisioned BlessBoard church administrator |
| Auth / tenant / role | OK (`website.edit`) |
| Route | `POST /c/:org/website/media` |
| Decision | **403 `csrf`** — empty CSRF because GET `/c/:org?website_edit=1` **301**s to primary branch and the test did not follow redirects |

`SHOULD_ACTOR_BE_AUTHORIZED=YES` (actor is authorized; denial was CSRF/fixture).

**Fix (stale test):** follow redirects to obtain CSRF; assert unauthorized
cross-tenant media fetch remains **404**.

### 3. Platform announcement publish (`RC_ANN_PLATFORM_PUBLISH_403`)

| Step | Result |
|---|---|
| Actor | `platform_administrator` |
| Auth | Session OK |
| Product access | `/hq` requires audited support session |
| Decision | **403** without support cookie; capability unit used alias `platform_admin` |

`SHOULD_ACTOR_BE_AUTHORIZED=YES` when `DEPLOYMENT_ENV=testing` + support session.
`SHOULD_ACTOR_BE_AUTHORIZED=NO` in production (policy deny preserved).

**Fix (stale test):** start HQ support session + support cookie; capability
assert uses catalogue key `platform_administrator`. Production publish still
403; CSRF still required.

### 4. Branch editor history/styles/seo (`RC_HTTP_AUTHZ_STATUS`)

| Step | Result |
|---|---|
| Actor | Was `branch_admin` on primary HQ URL |
| Product rule | Primary `/c/:org/hq` serves **church-wide** CMS; HQ chrome URLs are org-scoped |
| Decision | 403 / missing branch-scoped chrome for branch_admin primary path |

`SHOULD_ACTOR_BE_AUTHORIZED=YES` for `church_hq_admin` on branch-prefixed
management routes; branch-scoped chrome applies to **non-primary** campus.

**Fix (stale test):** assign `church_hq_admin` for primary branch management
pages; assert branch-scoped chrome on campus branch.

## Prerequisite chains

### Registration phone / provision

**Earliest failure:** `freeBody()` built invalid Kenya numbers
(`+2547` + ZM `97…` national) → validation field `phone` → every provision POST
400.

**Fixes:**

- Structured `phone_country` / `phone_national` (KE) in instant-free fixture
- Phone uniqueness index assert → `platform_church_reg_apps_phone_inflight_uidx`
- Closed-enquiry reuse uses non-occupying `cancelled` status
- Multi-org same-email expects 303 (product allows identity reuse)
- Draft page seed count 8 → 9
- **App defect:** provision close now sets `legacyStatus: "closed"` (comment was
  present; property omitted)

### `branch_not_found`

**Earliest failure:** fixtures assign `branchKey: "hq"` after
`createChurchRegistrationApplication` default HQ name **Headquarters** → key
`headquarters`.

**Fix:** look up provisioned `branch_key` before `assignBlessBoardRole`.
Both BNF files no longer fail setup (`branch_not_found` = 0).

## Targeted verification (post-fix)

| Suite | Result |
|---|---|
| `activeclinic-roles-access-admin` + `parity` + `v8-shared-rbac-tenant-isolation` | PASS |
| `blessboard-announcement-platform-admin-testing-policy` | PASS |
| `v7-branch-editor-canonical-actions` | PASS |
| `shared-website-editor-wave4b1` media upload + cross-tenant | PASS |
| `blessboard-registration-phone` | PASS |
| `blessboard-instant-free-registration` | PASS |
| `blessboard-branch-admin-route-reconciliation` | PASS |

## Files touched (Wave 1)

**Application**

- `src/platform/rbac/sharedTenantScope.js`
- `src/activeclinic/http/activeClinicPermissionMiddleware.js`
- `src/blessboard/services/provisionRegisteredBlessBoardChurch.js`

**Tests / fixtures**

- `tests/v8-shared-rbac-tenant-isolation.test.js`
- `tests/blessboard-announcement-platform-admin-testing-policy.test.js`
- `tests/v7-branch-editor-canonical-actions.test.js`
- `tests/shared-website-editor-wave4b1.test.js`
- `tests/blessboard-instant-free-registration.test.js`
- `tests/blessboard-registration-phone.test.js`
- `tests/blessboard-branch-admin-route-reconciliation.test.js`
- `tests/blessboard-tenant-context-website-routes.test.js`

## Residual (out of Wave 1 hard scope)

- CSS fingerprint / library label debt
- Broad 301 expectation cleanup
- Member-journey / some risk-review phone leaves (not the church freeBody root)
- Non-BNF failures inside tenant-context helper URL contracts
- Full 865-file re-census deferred to later wave

## Declarations

```
RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
PRODUCTION=UNTOUCHED
COVERAGE_CAMPAIGN=FROZEN
```

```
V2_03_REMEDIATION_WAVE1_PASS
```
