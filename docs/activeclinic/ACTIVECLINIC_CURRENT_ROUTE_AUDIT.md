# ActiveClinic — Current Route Audit (AC-V6-11)

**Source of truth:** route registration in code under `src/activeclinic/http/`.  
**Not inferred from docs alone.** Audited against branch `V6` / commit `ba1c1e95c2680a3d0d50f4a40414c8884a91916c`.

Registration order in `activeClinicFoundationServer.js`:

1. product context middleware  
2. auth session middleware  
3. `registerActiveClinicAuthRoutes`  
4. `registerActiveClinicLifecycleRoutes`  
5. `registerActiveClinicAppRoutes`  
6. `registerActiveClinicStaffAdminRoutes`  
7. `/healthz` + `/__ac/*` probes + `/`

---

## Summary

| Area | Count | Auth | CSRF on writes | Notes |
|---|---:|---|---|---|
| Auth | 8 | mixed | POST yes | Inline HTML (not shell) |
| Lifecycle | 6 | public token/neutral | POST yes | Inline HTML |
| App shell pages | 11 | required | POST yes | EJS shell |
| Staff admin | 12 | required | POST yes | Mostly JSON / invite HTML |
| Infra probes | 8+ | none / product ctx | n/a | Production 404 |
| Health / root | 2 | none | n/a | OK |

---

## Auth (`activeClinicAuthRoutes.js`)

| Method | Route | Handler | Middleware | Auth | Permission | Org / facility | Service deps | View | State |
|---|---|---|---|---|---|---|---|---|---|
| GET | `/login` | inline render | — | public | — | product ctx | — | inline HTML | **functional** |
| POST | `/login` | authenticate | rate limit | public | — | resolves org | `authenticateActiveClinicIdentity`, session create | redirect / re-render | **functional** |
| GET | `/login/select-organization` | inline | pending login cookie | pending | — | multi-org | eligibility | inline HTML | **functional** |
| POST | `/login/select-organization` | select + session | pending | pending | — | chosen org | session create | redirect | **functional** |
| POST | `/logout` | revoke | — | cookie | — | — | `revokeV5Session` | redirect `/login` | **functional** |
| GET | `/account/change-password` | inline | require auth | yes | — | session org | — | inline HTML | **functional** |
| POST | `/account/change-password` | change | require auth + CSRF | yes | — | identity | `changeActiveClinicPassword` | redirect / re-render | **functional** |

---

## Lifecycle (`activeClinicLifecycleRoutes.js`)

| Method | Route | Auth | Permission | CSRF | Services | View | State |
|---|---|---|---|---|---|---|---|
| GET | `/activate/:token` | public token | — | — | invitation lookup | inline | **functional** |
| POST | `/activate/:token` | public token | — | yes | `activateActiveClinicStaff` | redirect login | **functional** |
| GET | `/forgot-password` | public | — | — | — | inline | **functional** |
| POST | `/forgot-password` | public + rate limit | — | yes | password recovery (enumeration-safe) | inline success | **functional** |
| GET | `/reset-password/:token` | public token | — | — | token validate | inline | **functional** |
| POST | `/reset-password/:token` | public token | — | yes | complete reset | redirect login | **functional** |

---

## App shell (`activeClinicAppRoutes.js`)

| Method | Route | Auth | Permission | Org scope | Facility scope | Services | View | State |
|---|---|---|---|---|---|---|---|---|
| GET | `/app` | yes | `activeclinic.access` | session | selected optional | shell VM | `home-content.ejs` | **functional** (placeholder home) |
| GET | `/app/facilities` | yes | `activeclinic.facility.view` | org | — | `listFacilitiesByOrganization` | list EJS | **functional** read |
| GET | `/app/facilities/:facilityKey` | yes | `activeclinic.facility.view` | org | by key | `getFacilityByOrganizationAndKey` | detail EJS | **functional** read |
| GET | `/app/staff` | yes | `activeclinic.staff.view` | org | labels only | staff + facility assignment list | list EJS | **functional** read |
| GET | `/app/access` | yes | `activeclinic.staff.assign_access` | org | — | static role blurbs | access EJS | **placeholder** (no editor) |
| GET | `/app/settings` | yes | `activeclinic.organization.manage` | org | — | permission-gated links | settings EJS | **placeholder** landing |
| GET | `/app/select-facility` | yes | auth only | org | staff-visible | `listSelectableFacilities` | select EJS | **functional** |
| POST | `/app/select-facility` | yes + CSRF | auth only | org | ownership check | `selectFacilityForSession` | redirect | **functional** |
| GET | `/app/select-organization` | yes | auth only | multi | — | eligibility list | select EJS | **functional** |
| POST | `/app/select-organization` | yes + CSRF | auth only | switch | clears facility | revoke + new session | redirect | **functional** |

**Missing app HTML routes (services may exist):** facility create/edit/archive/set-primary; staff detail/create/edit; role assignment UI; organization settings write.

---

## Staff admin (`activeClinicStaffAdminRoutes.js`)

All require ActiveClinic auth. Permission checked via `authorizeStaffPermission` per action. CSRF validated on POSTs.

| Method | Route | Permission | Response | State |
|---|---|---|---|---|
| POST | `/app/staff/invite` | `activeclinic.staff.invite` (+ create) | HTML invite panel or JSON | **functional** (no Stitch form) |
| POST | `/app/staff/:staffId/invitations` | invite | JSON/HTML | **functional** |
| POST | `/app/staff/:staffId/invitations/reissue` | invite | JSON/HTML | **functional** |
| POST | `/app/staff/:staffId/invitations/revoke` | invite | JSON/HTML | **functional** |
| GET | `/app/staff/:staffId/invitations` | invite/view | JSON | **functional** |
| POST | `/app/staff/:staffId/send-reset` | `activeclinic.staff.manage_credentials` | JSON | **functional** |
| POST | `/app/staff/:staffId/revoke-sessions` | manage_credentials | JSON | **functional** |
| POST | `/app/staff/:staffId/require-password-change` | manage_credentials | JSON | **functional** |
| POST | `/app/staff/:staffId/unlock` | manage_credentials | JSON | **functional** |
| POST | `/app/staff/:staffId/suspend` | `activeclinic.staff.archive` (or update path) | JSON | **functional** |
| POST | `/app/staff/:staffId/restore` | staff update/archive restore | JSON | **functional** |

**Flags:** invite success UI is temporary inline HTML outside the shared shell — retire when staff detail Stitch/admin UI exists. Staff list rows do not deep-link to `:staffId` detail page (detail HTML missing).

---

## Infrastructure probes (`activeClinicFoundationServer.js`)

| Method | Route | Production | State |
|---|---|---|---|
| GET | `/healthz` | allowed | functional |
| GET | `/` | redirects/info | functional |
| GET | `/__ac/organization-context` | **404** | test/dev only |
| GET | `/__ac/organizations` | **404** | test/dev only |
| GET | `/__ac/healthcare-organization-context` | **404** | test/dev only |
| GET | `/__ac/facilities` | **404** | test/dev only |
| GET | `/__ac/facilities/:facilityKey` | **404** | test/dev only |
| GET | `/__ac/staff` | **404** | test/dev only |
| GET | `/__ac/staff/:staffId` | **404** | test/dev only |
| GET | `/__ac/staff/:staffId/facilities` | **404** | test/dev only |
| GET | `/__ac/staff/:staffId/permissions` | **404** | test/dev only |

**Flag:** comment still says temporary; keep production-gated until retired. Not Stitch surfaces.

---

## Audit flags

| Flag | Finding |
|---|---|
| Duplicate routes | None found |
| Unprotected app pages | Select facility/org require auth only (intentional) |
| Role-name allowlists | Not used on routes; permission keys used |
| Test routes in production | `/__ac/*` return 404 when `isProduction` |
| Direct repository from routes | App routes call services; staff admin/auth similarly service-backed |
| Missing CSRF | Not observed on mutating POSTs audited |
| Missing org scope | Authenticated routes use session org from `activeClinicAuth` |
| Missing facility scope | Facility selection stored in session `context_json`; permission checks pass `selectedFacilityId` when present |
| Temporary to retire | `/__ac/*`; invite-result inline HTML; static `/app/access` copy |

---

## Clinical / Stitch modules

No routes exist for patients, appointments, reception, triage, consultations, pharmacy, laboratory, imaging, or billing. Do not invent them as “current.”
