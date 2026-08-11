# V7 Unified Multi-Product Platform Architecture

Branch: **V7** (integration branch toward eventual `main`).  
Do not rename V7 to `main` until verified. Do not deploy or change Hostinger/DNS from this document alone.

> **Domain-resolved runtime:** see also `docs/platform/V7_DOMAIN_RESOLVED_RUNTIME.md`.
> Preferred Hostinger codes: `moovex-platform-testing` / `moovex-platform-production`
> with `identity_key=moovex-platform-v7` and hostname selecting the product.

## 1. Product model

| Product key | Brand | Site type | Canonical production domain |
| ----------- | ----- | --------- | --------------------------- |
| `blessboard` | BlessBoard | product | `blessboard.com` |
| `activeclinic` | ActiveClinic | product | `activeclinic.org` |
| `getpro` | GetPro | product | `getproapp.org` |
| `ngo` | **Netraz** | product | `netraz.org` |
| `platform` | Moovex Platform | platform / corporate site support | — |

Internal NGO product key is **`ngo`**. Brand is **Netraz**. Do not use `netraz` as the product key.

**FunSong (`funsong.org`)** is a private/separate project and is **not** a `platform.products` entry.

**Moovex (`moovex.org`)** is the parent company corporate site (`site_type = corporate`), not a tenant product.

Registry: `src/platform/config/productRegistry.js` (single registry).

## 2. Deployment model

Authoritative selector:

```env
PLATFORM_DEPLOYMENT_CODE=<deployment-code>
```

Resolution:

```text
PLATFORM_DEPLOYMENT_CODE
        ↓
deployment registry (deploymentProfiles.js + canonicalDeploymentProfiles.js)
        ↓
product / brand / environment / canonical domain /
expected DB environment / cookies / jobs / default country / feature posture
```

Do **not** treat `PLATFORM_PRODUCT`, `PUBLIC_DOMAIN`, or `ENVIRONMENT` as competing sources of truth. Legacy vars may remain for compatibility but **must not disagree** with the resolved profile (fail closed).

`NODE_ENV` is only for Node runtime (`production` / `test` / `development`). Product selection belongs to the deployment profile.

## 3–4. Domains and testing domains

See `src/platform/config/domainMatrix.js` and section AA below.

Testing namespace: **`pronline.org`**

| Product | Testing host |
| ------- | ------------ |
| BlessBoard | `blessboard.pronline.org` |
| ActiveClinic | `activeclinic.pronline.org` |
| GetPro | `getpro.pronline.org` |
| Netraz | `netraz.pronline.org` |

## 5. Deployment codes

### Canonical (Hostinger target)

| Hostinger app | `PLATFORM_DEPLOYMENT_CODE` |
| ------------- | -------------------------- |
| BlessBoard production | `blessboard-com-production` |
| BlessBoard testing | `blessboard-pronline-testing` |
| ActiveClinic production | `activeclinic-org-production` |
| ActiveClinic testing | `activeclinic-pronline-testing` |
| GetPro production | `getproapp-org-production` |
| GetPro testing | `getpro-pronline-testing` |
| Netraz production | `netraz-org-production` |
| Netraz testing | `netraz-pronline-testing` |

Optional corporate: `moovex-org-production`.

Prepared (not for Hostinger yet): `blessboard-org-legacy-redirect` — path-preserving 301 to `https://blessboard.com`.

### Legacy (still registered)

| Legacy | Intended V7 destination | Notes |
| ------ | ------------------------ | ----- |
| `blessboard-org-v5` | `blessboard-pronline-testing` | Alias → `blessboard-org-staging` today |
| `blessboard-com-v4` | `blessboard-com-production` | Alias |
| `blessboard-org-staging` | `blessboard-pronline-testing` | Keep until Hostinger testing cutover |
| `activeclinic-org-v6` | `activeclinic-pronline-testing` | Keep until testing leaves `activeclinic.org` |
| Unprofiled GetPro (`server.legacy.js`) | `getproapp-org-production` / `getpro-pronline-testing` | Prefer explicit codes |

## 6. Startup resolution

```text
server.js
  → assertDeploymentProfileOrExit()
  → resolveDeploymentConfiguration()
  → startV5FoundationServer()
       → resolveProductBootstrapTarget()
            → legacy-redirect | activeclinic | getpro | ngo | moovex-corporate | blessboard
```

Unknown non-empty `PLATFORM_DEPLOYMENT_CODE` → fatal exit.

## 7. Shared platform vs product boundaries

**Share mechanisms; keep business meaning product-specific.**

Shared now (platform):

- Identities, sessions, organization foundation, `organization_products`
- Deployment registry + DB/env identity guards
- Phone normalization / E.164 / country list / PhoneField include path
- RBAC *engine pattern* (catalogue still physically in `blessboard.*` — future migration)
- Files, audit, invitations foundations where already platform-owned

Product-specific:

- BlessBoard: churches, members, giving, sermons, websites, HQ/member routes
- ActiveClinic: patients, pharmacy, radiology, clinical encounters, reception
- GetPro: CRM / leads / field agents (legacy + foundation boundary)
- Netraz (`ngo`): foundation only (programs/beneficiaries later)

## 8. Product route isolation

Route packs register **only** for the resolved product (server-side).

- `createV5FoundationApp` requires `blessboard`
- `createActiveClinicFoundationApp` requires `activeclinic`
- `createGetProFoundationApp` requires `getpro`
- `createNgoFoundationApp` requires `ngo`
- Registrars in `productRouteBootstrap.js` refuse foreign packs

Tests: `tests/v7-unified-platform.test.js`

## 9. Database boundaries

Schemas: `platform.*`, `blessboard.*`, `activeclinic.*`, `getpro.*` (empty), `ngo.*` (empty).

Seed `db/seeds/006_v7_unified_deployments.sql` adds non-colliding V7 deployment rows and sets NGO display name to Netraz.

**Deferred DB rows** (unique `canonical_domain` still held by legacy testing):

- `activeclinic-org-production` (domain held by `activeclinic-org-v6`)
- `blessboard-org-legacy-redirect` (domain held by `blessboard-org-staging`)

JS profiles already define them for cutover.

### ActiveClinic isolation risk

Clinical tables live in `activeclinic.*` with FKs to `platform.organizations`. RBAC catalogue currently lives in `blessboard.*` — coupling risk if BlessBoard schema drifts. Clinical PHI must not be joined casually across products.

## 10. Phone architecture

- Service: `src/platform/services/phoneNumberService.js`
- PhoneField include: `views/platform/partials/phone-field.ejs` → ActiveClinic partial (adapter)
- Locals: `src/platform/services/platformPhoneFieldLocals.js`
- Storage: E.164; flags presentation-only
- Default country: org/clinic → deployment `defaultCountry` → platform → **ZM**

## 11. RBAC architecture

One authorization *pattern*; product-namespaced keys preferred for new work (`activeclinic.*`, future `ngo.*`). Do not mass-rename live BlessBoard keys (`members.view`, etc.) in V7.

## 12. Identity architecture

`platform.identities` + `identity_product_profiles` + `organization_products`. An organization may enrol in multiple products. Identity alone does not grant product access.

## 13. Production safeguards

- Profile vs `DEPLOYMENT_ENV` / domain / cookie conflicts → refuse start
- `assertPlatformDatabaseIdentityOrExit` — testing deployment must not use production DB identity and vice versa
- No production Hostinger/DNS/DB mutations from this branch task

## 14. Migration path V5 / V6 → V7

- V6 already contains V5 history; do not merge V5 into V7
- V7 starts from V6 tip + preserved dirty work
- Move Hostinger testing codes to `*-pronline-testing`
- Free `activeclinic.org` for production profile DB seed after testing moves
- Profile GetPro (stop relying on unset deployment code)
- Activate `blessboard-org-legacy-redirect` only after DNS/Hostinger plan

## 15. Hostinger configuration requirements (later — not applied)

Set only `PLATFORM_DEPLOYMENT_CODE` (plus `NODE_ENV`, `DATABASE_URL`, `SESSION_SECRET`) per app using the table in §5. Do not paste secrets into docs.

BlessBoard.org redirect Hostinger step (future):

1. Point blessboard.org app at redirect profile `blessboard-org-legacy-redirect`
2. Confirm path preservation (`/register-church` → blessboard.com/register-church)
3. Keep blessboard.com on `blessboard-com-production`

## 16. Future transition to `main`

```text
main          ← production-ready unified platform (later)
V7            ← integration branch (now)
feature/* / fix/*
```

Do not force-push `main`. Promote only after V7 verification.

## Environment matrix

| Type | Product/site | Domain |
| ---- | ------------ | ------ |
| Production | BlessBoard | `blessboard.com` |
| Testing | BlessBoard | `blessboard.pronline.org` |
| Legacy redirect | BlessBoard | `blessboard.org` → `blessboard.com` (future) |
| Production | ActiveClinic | `activeclinic.org` |
| Testing | ActiveClinic | `activeclinic.pronline.org` |
| Production | GetPro | `getproapp.org` |
| Testing | GetPro | `getpro.pronline.org` |
| Production | NGO / Netraz | `netraz.org` |
| Testing | NGO / Netraz | `netraz.pronline.org` |
| Corporate | Moovex | `moovex.org` |
| Testing namespace | Platform | `pronline.org` |
| Private | FunSong | `funsong.org` (separate) |

## Target directory layout (evolutionary — not a bulk move)

```text
src/platform/...   # shared mechanisms (already primary)
src/blessboard/...
src/activeclinic/...
src/getpro/...
src/ngo/...
sites/moovex/...   # future extraction; corporate server lives under platform/http for now
```

Prefer adapters, registries, and compatibility layers over mass renames.
