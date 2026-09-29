# V2.03 Remediation — Wave 2

**FINAL: `V2_03_REMEDIATION_WAVE2_PASS`**

## Mission

Resolve remaining functional P2/P3 failures and the 301 redirect cluster.
No CSS pin remediations, no coverage campaign, no production writes.
Preserve domain/product isolation; no RBAC / tenant-isolation weakening.

## Identity

| Field | Value |
|---|---|
| Branch | `V10` |
| Inputs | `docs/qa/V2_03_294_FAILURE_QA_GAP_TRIAGE.md`, `docs/qa/V2_03_REMEDIATION_WAVE1.md` |
| `PRODUCTION` | **UNTOUCHED** |
| Coverage | **FROZEN** |
| CSS pins | **DEFERRED** (Wave 4+) |

## Census

```
FAILURES_AT_START≈90
FAILURES_ELIMINATED≈89
FAILURES_REMAINING≈1

301_BEFORE=32
301_FIXED=32
301_REMAINING=0

APPLICATION_DEFECTS_FIXED=0
STALE_TESTS_FIXED≈28
FIXTURE_DRIFT_FIXED≈8
HTTP_CONTRACT_FIXES≈32

QA_PASSING≈82/98
QA_NOT_PASSING≈16/98

P0=0
P1=0

PRODUCTION=UNTOUCHED
```

`FAILURES_AT_START` is the Wave-2 in-scope slice after Wave 1 (301 cluster +
registration/phone residual + HTTP/publish/editor contracts), not the full 294.

`FAILURES_REMAINING≈1` in the Waves 1–2 touched suite set is the intentional
CSS cache-bust pin (`tenant-public.css?v=58` vs live `?v=67`) — out of Wave 2
scope.

QA totals remain estimates from triage scenario recovery (301 + reg + E2E +
draft/publish paths); full Phase C re-automation was not re-run.

## 301 cluster — intended contract

Canonical BlessBoard public routing (path mode):

| REQUEST | EXPECTED_CANONICAL_ROUTE | EXPECTED_STATUS | EXPECTED_LOCATION | AUTH_STATE | PRODUCT |
|---|---|---|---|---|---|
| `GET /c/:org` | primary branch home | **301** | `/c/:org/:primaryBranch` | anon or session | BlessBoard |
| `GET /c/:org/:branch` | same | **200** | — | anon | BlessBoard |
| `GET /c/:org/:branch/:page` | same | **200** | — | anon | BlessBoard |
| `GET /c/:org/:page` (legacy org-only page) | primary branch page | **301** | `/c/:org/:primaryBranch/:page` | anon | BlessBoard |
| `GET /c/:org/branches/:branch…` (legacy) | flat branch path | **301** | `/c/:org/:branch…` | anon | BlessBoard |
| `GET /c/:org?website_edit=1` | primary branch editor | **301** | `/c/:org/:primaryBranch?website_edit=1` | authenticated editor | BlessBoard |
| Org HQ CMS `/hq/*` | session HQ | **200** | — | HQ session | BlessBoard |
| Cross-product AC `/clinics/:slug` | clinic public | **200** (no BB 301) | — | — | ActiveClinic |

**Decision:** redirects are intentional canonicalization — **not** application
regressions. Tests that expected bare `/c/:org` **200** were **STALE_TEST** /
**HTTP_CONTRACT**. Fixes: follow redirects (`redirects(5)`), assert 301 then
canonical 200, or call primary-branch URLs directly.

No redirect loops observed. No cross-product routing bleed (AC clinic paths
unchanged).

### Suites updated for 301 contract

- `blessboard-branch-mini-website-{shell,pages,websites}`
- `blessboard-branch-website-settings-chrome-scope`
- `blessboard-apex-hq-website-lifecycle`
- `blessboard-demo-church-config`
- `blessboard-website-branding`
- `blessboard-inline-edit-save-contract`
- `blessboard-phase7-public-density-audit` (HTTP only; CSS pin untouched)
- `blessboard-tenant-context-website-routes`
- `shared-website-editor-wave{2,3,4b1}`
- `v7-blessboard-website-engine-convergence`
- `v7-local-registration-to-website-e2e`
- `v7-new-church-operational-readiness`
- `v7-website-draft-live-integrity`
- `v7-inline-editor-coverage`

## Non-CSS root causes resolved

| Area | Classification | Layer | Fix |
|---|---|---|---|
| Org/public 301 vs 200 asserts | HTTP_CONTRACT / STALE_TEST | tests | Follow/assert canonical 301→branch 200 |
| Phase7 “Coming soon” on HTTP | DATA_STATE / FIXTURE_DRIFT | tests | Publish settings + public pages in provisionDemo; use `primaryPublicBase` |
| Engine provisional `website_versions` count | STALE_TEST | tests | Allow ≤1 seed version; restore skips provisional seed |
| Restore historic heading | STALE_TEST | tests | Select first publish snapshot containing intended hero, not seed |
| DLI demo image CDN | FIXTURE_DRIFT | tests | Use mapped `/church/images/tenant-public/home-desktop-hero.jpg` |
| Inline editor chrome (`data-bb-inline-*`) | STALE_TEST | tests | Shared Wave-2 attrs + field-editor-host Save draft |
| AC “Save to draft” copy | STALE_TEST | tests | Assert `Save draft` |
| Reg / risk-review phone overrides | FIXTURE_DRIFT / VALIDATION | tests | `phone_country` + `phone_national` (KE/ZM); duplicate uses shared national |
| Member journey contacts without phone | FIXTURE_DRIFT | tests | Supply phone (phone-first required) |
| Actor keys `platform_admin` / `branch_admin` | STALE_TEST | tests | Catalogue keys `platform_administrator` / `branch_administrator` |
| DRAFT_KINDS inventory | STALE_TEST | tests | Include `page_section` |
| Wave4b1 “choose existing” copy | STALE_TEST | tests | `Choose from Image Library` + `data-website-library` |

**Application defects proven in Wave 2:** none for the 301 cluster (intentional
routing). Wave 1 remains the only APPLICATION_DEFECT remediations in this
campaign (`sharedTenantScope` / AC facility targets; provision legacyStatus).

## Verification

Waves 1–2 touched suites (26 files):

```
tests=247
pass=246
fail=1
```

Sole remaining failure:

- `Phase 7 density audit — CSS and inventory contracts` → cache-bust pin
  `?v=58` vs live `?v=67` (**RC10_CSS_FINGERPRINT** — deferred).

## Residual (explicitly out of Wave 2)

- CSS `?v=` fingerprint / density CSS pins
- Remaining QA automation gaps not covered by these suites (~16 estimated)
- Full 865-file canonical re-census
- Coverage gates (Phase D/E)

## Declarations

```
RBAC_WEAKENED=NO
TENANT_ISOLATION_WEAKENED=NO
PRODUCTION=UNTOUCHED
COVERAGE_CAMPAIGN=FROZEN
CSS_PINS=DEFERRED
```

```
V2_03_REMEDIATION_WAVE2_PASS
```
