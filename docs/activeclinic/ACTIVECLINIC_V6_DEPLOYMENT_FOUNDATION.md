# ActiveClinic V6 — Deployment Foundation

**Prompt:** AC-V6-02  
**Branch:** `V6`  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_DEPLOYMENT_FOUNDATION_COMPLETE`

## Product registry

Canonical module: `src/platform/config/productRegistry.js`

| productCode | displayName | routeModule |
|-------------|-------------|-------------|
| `blessboard` | BlessBoard | blessboard |
| `activeclinic` | ActiveClinic | activeclinic |
| `getpro` | GetPro | none |
| `ngo` | NGO | none |
| `platform` | Platform | platform |

`APPLICATION_CODES` matches `platform.deployments.application_code` CHECK (migration `018_activeclinic_application_code.sql`).

Deployment-specific domains and cookies live on **deployment profiles** (not a second competing registry). Profiles reference `productCode`.

## ActiveClinic deployment profile

| Field | Value |
|-------|--------|
| Deployment code | `activeclinic-org-v6` |
| Product code | `activeclinic` |
| Canonical domain | `activeclinic.org` |
| Environment | `testing` |
| Expected DB environment | `testing` |
| Session cookie | `activeclinic_org_sid` |
| CSRF cookie | `activeclinic_org_csrf` |
| Jobs | disabled |
| Runtime | `v5-foundation` (shared) |

Seed: `db/seeds/004_activeclinic_product_and_deployment.sql`

## CSRF parameterization

`src/platform/http/v5Csrf.js` resolves the cookie name via `getCsrfCookieName(env)` from the authoritative deployment profile.

| Profile | CSRF cookie |
|---------|-------------|
| BlessBoard `.com` / `.org` | `blessboard_org_csrf` (unchanged) |
| ActiveClinic | `activeclinic_org_csrf` |

Export `CSRF_COOKIE` remains the BlessBoard default for existing tests.

## Route bootstrap

`src/platform/http/productRouteBootstrap.js`:

- `registerPlatformRoutes` — boundary marker
- `registerBlessBoardRoutes` — delegated to `v5FoundationServer` (no rewrite)
- `registerActiveClinicRoutes` — stub `GET /` only

`startV5FoundationServer` dispatches to `src/activeclinic/http/activeClinicFoundationServer.js` when `productCode === activeclinic`.

## Startup validation

Authoritative profiles fail closed on:

- unknown deployment code
- unknown / mismatched product code
- missing session or CSRF cookie names
- `BASE_DOMAIN` / BlessBoard domain env conflicts
- session / CSRF cookie env mismatches
- existing DB environment pairing (unchanged)

## Deferred

- User identity architecture (`blessboard.users` vs platform identity) — AC-V6-04
- Healthcare org / facilities — AC-V6-05
- ActiveClinic login / RBAC — later prompts
- Production ActiveClinic Hostinger profile — not invented in V6 foundation

## Tests

- `tests/activeclinic-deployment-foundation.test.js`
- Extended: `tests/deployment-profiles.test.js`, `tests/db-foundation.test.js`, `tests/db-bootstrap-foundation.test.js`
