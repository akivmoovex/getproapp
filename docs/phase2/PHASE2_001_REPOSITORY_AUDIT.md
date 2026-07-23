# PHASE2_001 — Repository Structure Audit

**Date:** 2026-07-23  
**Scope:** BlessBoard V5 only  
**Mode:** Documentation only — **no runtime code was changed**  
**Confirmation:** `git status` clean after this audit (docs added under `docs/phase2/` only).

---

## 1. Active V5 server entry point

| Role | Path |
|------|------|
| Process entry | `index.js` → `require("./server.js")` |
| Bootstrap | `server.js` |
| V5 HTTP app | `src/platform/http/v5FoundationServer.js` → `startV5FoundationServer()` |
| V5 mode gate | `src/platform/config/v5FoundationMode.js` |

**Activation:** V5 runs when `isV5FoundationMode()` is true:

- `PLATFORM_DEPLOYMENT_CODE=blessboard-org-v5`
- `DEPLOYMENT_ENV=testing`

Otherwise `server.js` loads `server.legacy.js` (V4).

**package.json:** `"main": "index.js"`, `"start": "node index.js"`.

**Active V5 trees:** `src/platform/`, `src/blessboard/`, `views/blessboard/v5/`, `public/blessboard/v5/`, `db/migrations/blessboard/`.

---

## 2. Platform Admin route files and mount paths

| Item | Path / detail |
|------|----------------|
| Router factory | `src/platform/http/platformAdminRoutes.js` → `createPlatformAdminRouter(deps)` |
| Mount | `v5FoundationServer.js` via `app.use(createPlatformAdminRouter(...))` — **no path prefix**; routes are absolute `/admin…` |
| Nav config | `src/platform/http/platformAdminNav.js` |
| Shell locals | `src/platform/http/platformAdminShellLocals.js` |

### Registration & organization routes (apex + `platform_admin`)

| Method | Path |
|--------|------|
| GET | `/admin` |
| GET | `/admin/account` |
| POST | `/admin/logout` |
| GET | `/admin/organizations` |
| GET | `/admin/organizations/:organizationKey` |
| GET | `/admin/registration-applications` |
| GET | `/admin/registration-applications/:id` |
| POST | `/admin/registration-applications/:id/follow-up-status` |
| POST | `/admin/registration-applications/:id/assign-support` |
| POST | `/admin/registration-applications/:id/contact` |
| POST | `/admin/registration-applications/:id/reject` |
| POST | `/admin/registration-applications/:id/approve` |
| POST | `/admin/registration-applications/:id/mark-validation-complete` |
| POST | `/admin/registration-applications/:id/retry-provision` |
| POST | `/admin/registration-applications/:id/link-organization` |
| GET/POST | `/admin/plans`, `/admin/subscriptions`, `/admin/domains…`, `/admin/deployments…`, `/admin/settings`, `/admin/maintenance…` |

**Not present today (Phase2 candidates):**  
`/verification`, `/phone-verification`, `/email-verification`, `/duplicates`, `/duplicates/:matchId` under an application.

---

## 3. Authentication and authorization middleware

| Piece | Location | Behavior |
|-------|----------|----------|
| Session load | `src/platform/http/loadV5Session.js` | Sets `req.v5Session` |
| Session cookie / store | `src/platform/session/v5SessionCookie.js`, `readV5Session.js`, `createV5Session.js`, `revokeV5Session.js` | Host-only V5 cookie for deployment `blessboard-org-v5` |
| Apex gate | Inline `requireApex` in `platformAdminRoutes.js` | Apex host only |
| Role gate | Inline `requirePlatformAdmin` | Active user + `role_key === "platform_admin"` via `blessBoardAuthorizationRepository.listActiveAuthorizationRoles` / `findUserStatusById` |
| Context | `req.platformAdminContext` | `{ authenticated, authorized, userId, displayName, roleLabel }` |
| CSRF | `src/platform/http/v5Csrf.js` | Cookie `blessboard_org_v5_csrf`, field `_csrf`; `validateCsrf` called **inline on POST handlers** (not a global router middleware) |
| Shell CSRF issue | `buildPlatformAdminShellLocals` | Fresh token + cookie per HTML render |

**Roles table:** `blessboard.user_roles` — allowed keys: `platform_admin`, `church_hq_admin`, `branch_admin` (`db/migrations/blessboard/005_create_user_roles.sql`).

**No fine-grained Platform Admin permissions** beyond the single `platform_admin` role gate.

**Do not use for V5 PA:** `src/church/platformAdminCsrf.js` (legacy V4).

---

## 4. Platform Admin layout and navigation

| Asset | Path |
|-------|------|
| Shell start | `views/blessboard/v5/partials/platform-admin-shell-start.ejs` |
| Shell end | `views/blessboard/v5/partials/platform-admin-shell-end.ejs` |
| Nav | `PLATFORM_ADMIN_NAV` / `PLATFORM_ADMIN_MOBILE_TABS` in `platformAdminNav.js` |
| Powered-by | `views/blessboard/v5/partials/powered-by-getpro.ejs` |
| Head DS | `views/blessboard/v5/partials/head-design-system.ejs` |

**Registration nav item:** key `registration-applications`, label “Registration Applications”, href `/admin/registration-applications`.

**Mobile tabs (current):** `home`, `organizations`, `plans`, `account` — **registration is not a mobile tab**.

**Views:** `views/blessboard/v5/platform-admin/` — includes `registration-applications.ejs`, `registration-application-detail.ejs`, `organizations.ejs`, `organization-detail.ejs`, etc.

---

## 5. Shared admin CSS and JavaScript

| Asset | Path / cache |
|-------|----------------|
| Platform Admin CSS | `public/blessboard/v5/platform-admin.css` (shell references `?v=` bump) |
| Design system | `public/blessboard/v5/design-system.css`, `design-tokens.css` |
| Shell nav JS | `public/blessboard/v5/shell-nav.js` |
| Design system JS | `public/blessboard/v5/design-system.js` |
| Dedicated `platform-admin.js` | **None** |

**Reusable state partials (shared V5, not PA-specific):**  
`empty-state.ejs`, `error-state.ejs`, `loading-state.ejs`, `success-state.ejs`, `flash-message.ejs`, `form-errors.ejs`, `pagination.ejs`.

---

## 6. Organization list and detail

| Layer | Path |
|-------|------|
| Routes | `platformAdminRoutes.js` — GET list/detail + org mutation POSTs |
| List service | `src/platform/services/listPlatformOrganizations.js` |
| Detail service | `src/platform/services/getPlatformOrganizationSummary.js` |
| Entitlements | `src/platform/services/platformAdminEntitlements.js` |
| Onboarding admin | `src/blessboard/services/organizationOnboardingAdminService.js` |
| Views | `organizations.ejs`, `organization-detail.ejs` |

---

## 7. Registration application routes

### Public (apex)

| Item | Detail |
|------|--------|
| Router | `src/blessboard/http/apexMarketingRoutes.js` |
| Path | `GET/POST /register-church` |
| View | `views/blessboard/v5/apex/register-church.ejs` |
| Validation | `platformChurchRegistrationValidation.js` |
| Submit | `submitPlatformChurchRegistration` / `submitInstantFreeChurchRegistration` |

### Platform Admin

Routes listed in §2. Detail param is `:id` (UUID), not `:applicationId`.

---

## 8. Registration repositories and services

| Layer | Path | Notable exports |
|-------|------|-----------------|
| Repository | `src/blessboard/repositories/platformChurchRegistrationRepository.js` | `createApplication`, `createApplicationIdempotent`, duplicate finders, `listRegistrationApplications`, `getRegistrationApplicationById`, provisioning/support updates, `listApplicationSupportContacts`, `listActivePlatformAdministrators`, status constants |
| Public submit | `src/blessboard/services/platformChurchRegistrationService.js` | `submitPlatformChurchRegistration`, `submitInstantFreeChurchRegistration` |
| Validation | `src/blessboard/services/platformChurchRegistrationValidation.js` | `validatePlatformChurchRegistration` |
| Admin ops | `src/blessboard/services/registrationApplicationsAdminService.js` | list/detail, follow-up, assign, contact, reject, approve/provision, link, mark validation complete |
| Risk | `src/blessboard/services/registrationRiskDecision.js` | `evaluateRegistrationRisk` |
| Operator UI | `src/blessboard/services/registrationOperatorPresenter.js` | queues/actions presentation |
| Provision | `src/blessboard/services/provisionRegisteredBlessBoardChurch.js` | orchestrator |
| Phone | `src/blessboard/services/normalizeRegistrationPhone.js` | E.164 normalize + uniqueness SQL helper |

**Table:** `blessboard.platform_church_registration_applications`

---

## 9. Existing Platform Admin / registration tests

V5-oriented (prefer these):

- `tests/blessboard-platform-admin-shell.test.js`
- `tests/blessboard-platform-admin-mobile-nav.test.js`
- `tests/blessboard-platform-admin-login-diagnosis.test.js`
- `tests/blessboard-admin-registration-applications.test.js`
- `tests/blessboard-admin-registration-ops.test.js`
- `tests/blessboard-register-church.test.js`
- `tests/blessboard-instant-free-registration.test.js`
- `tests/blessboard-growth-trial-registration.test.js`
- `tests/blessboard-registration-phone.test.js`
- `tests/blessboard-registration-risk-review.test.js`
- `tests/blessboard-registration-operator-approval.test.js`
- `tests/blessboard-registration-operator-presenter.test.js`
- `tests/blessboard-registration-approval-invitation.test.js`
- `tests/blessboard-registration-trace.test.js`
- `tests/blessboard-registration-onboarding-analytics.test.js`
- `tests/blessboard-network-support-registration.test.js`
- `tests/platform-v5-sessions.test.js`
- `tests/blessboard-v5-csrf-action-audit.test.js`

Legacy church-platform-* tests exist but are **not** V5 PA SoT.

---

## 10. V4 files — must not be changed for Phase2

| Area | Paths |
|------|-------|
| Legacy server | `server.legacy.js` |
| Legacy admin routes | `src/routes/blessboardAdmin.js`, `src/routes/admin/adminChurch*.js`, `src/routes/church/platformPublic*.js` |
| Legacy CSRF | `src/church/platformAdminCsrf.js` |
| Legacy shells | `views/partials/platform_admin_shell_*.ejs` |
| Legacy register view | `views/church/public/platform_register_church.ejs` |
| Legacy DDL | `db/postgres/*` (not `db/migrations/blessboard/`) |
| Forbidden legacy tables | `public.church_platform_inquiries`, `public.church_applications`, `public.registration_applications`, `public.tenants`, `public.session` |
| Marketing church.css | `public/church/church.css` — tenant/marketing; do not use for V5 PA |

---

## Risks

1. **Single role gate** — every PA action is all-or-nothing `platform_admin`; Stitch implies finer actions (override, sensitive docs, manual verify).
2. **Stitch vs product chrome** — Phase2 Stitch still labels “Moovex” in places; implement with BlessBoard V5 shell, not Stitch copy literally.
3. **Detail URL param** — code uses `:id`; Phase2 route map prefers `:applicationId` — alias or rename carefully.
4. **Registration missing from mobile tabs** — Stitch mobile shell/queue expect easier mobile access.
5. **Dual status columns** — legacy `status` + `application_status` / `provisioning_status` / `follow_up_status` — easy to confuse in UI.
6. **V4 contamination** — accidental edits to `server.legacy.js` or `src/routes/blessboardAdmin.js` would be out of scope and harmful.

---

## Runtime change confirmation

**No runtime code was modified.** Only documentation under `docs/phase2/` is intended to be added by this Phase2 audit series.
