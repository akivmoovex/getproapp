# BlessBoard V5 — CSRF and state-changing action audit

**Date:** 2026-07-19
**Constraint:** Audit only. Do **not** redesign CSRF architecture, cookie scope, or SameSite. Use existing signed double-submit (`v5Csrf.js`).
**Mechanism:** Cookie `blessboard_org_v5_csrf` + body field `_csrf` (HMAC with `SESSION_SECRET`). Media JSON also accepts header `X-CSRF-Token`. Host-only cookies; `SameSite=Lax`.

**Companions:** [`V5_AUTHORIZATION_MATRIX.md`](./V5_AUTHORIZATION_MATRIX.md) · [`V5_ROUTE_AND_LINK_AUDIT.md`](../testing/V5_ROUTE_AND_LINK_AUDIT.md) · `src/platform/http/v5Csrf.js`

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Every V5 POST registration validates CSRF? | **YES** (50/50 source registrations) |
| Every V5 EJS POST form includes CSRF field? | **YES** |
| Logout is POST + CSRF? | **YES** (all five shells) |
| Login uses signed double-submit? | **YES** |
| Sensitive actions triggered by GET? | **NO** for mutations; transfer GETs use one-time tokens (documented) |
| Missing protections requiring code fix? | **NONE** |
| Static coverage added? | **YES** — `tests/blessboard-v5-csrf-action-audit.test.js` |

**Counts:** **50** source `POST` registrations across V5 routers · **0** `PUT`/`PATCH`/`DELETE` · ~**100+** effective paths after HQ/branch mount expansion · **0** CSRF omissions.

---

## 2. CSRF mechanism (unchanged)

| Piece | Detail |
|-------|--------|
| Issue | `issueCsrfToken` → signed `v5c1.{nonce}.{mac}` |
| Cookie | `blessboard_org_v5_csrf` — not HttpOnly (double-submit), Secure in production, SameSite=Lax, path `/`, no parent Domain |
| Field | `_csrf` in form body (or multipart / JSON body) |
| Header (media) | `X-CSRF-Token` accepted on content-admin media upload/archive |
| Validate | Cookie and submitted token both verify + timing-safe equal |
| Fail | **403** before mutation (HTML or JSON `{ ok:false, reason:"csrf" }` for media) |

Wrappers: many modules use local `validateCsrfPost(req,res)`; registration approve/reject uses `postDecision` → CSRF then action.

---

## 3. Inventory (by area)

Test status: **Covered** = module suite asserts missing CSRF → 403 · **Static** = new inventory test · **Transfer** = one-time token (not double-submit)

### 3.1 Apex auth / foundation

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| apex auth | POST | `/login` | Password login | Public (apex) | Apex host | Double-submit `_csrf` | Covered (`test:blessboard:auth`) |
| apex auth | POST | `/logout` | Clear session | Session optional | — | Double-submit | Covered |
| tenant transfer | GET | `/login` | Create transfer | Anon | Tenant resolve | One-time `tr` (not CSRF) | Transfer (`tenant-auth`) |
| tenant transfer | GET | `/auth/callback` | Redeem + set session | Anon | One-time `code` | One-time code | Transfer |

### 3.2 Platform admin

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| platform administration | POST | `/admin/logout` | Logout | Apex session | Apex | Double-submit | Covered (PA shell) |
| platform administration | POST | `/admin/domains/:hostname/status` | Domain status | Session | `platform_admin` | Double-submit | Covered (PA suites) |
| platform administration | POST | `/admin/domains/:hostname/organization` | Domain org assign | Session | `platform_admin` | Double-submit | Covered |
| platform administration | POST | `/admin/organizations/:organizationKey/plan` | Plan assign | Session | `platform_admin` | Double-submit | Covered |
| platform administration | POST | `/admin/organizations/:organizationKey/entitlement-override` | Entitlement override | Session | `platform_admin` | Double-submit | Covered |

### 3.3 Tenant registration

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| tenant public | POST | `/register` | Submit registration | Anon | Tenant host | Double-submit | Covered (`member-registration`) |

### 3.4 Branch / HQ shells

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| HQ | POST | `/hq/logout` | Logout | Session | — | Double-submit | Covered (HQ shell) |
| HQ | POST | `/hq/settings` | Church settings | Session | HQ / PA | Double-submit | Covered (`settings`) |
| branch admin | POST | `/branch-admin/logout` | Logout | Session | — | Double-submit | Covered |
| branch admin | POST | `/branch-admin/settings` | Branch settings | Session | BA / HQ / PA | Double-submit | Covered |
| branch admin | POST | `/branch-admin/registrations/:registrationKey/approve` | Approve | Session | BA+ | Double-submit via `postDecision` | Covered (registration admin) |
| branch admin | POST | `/branch-admin/registrations/:registrationKey/reject` | Reject | Session | BA+ | Double-submit via `postDecision` | Covered |

### 3.5 Member portal

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| member | POST | `/member/profile` | Profile update | Session | Active member | Double-submit | Covered (`member-portal`) |
| member | POST | `/member/logout` | Logout | Session | — | Double-submit | Covered |
| member | POST | `/member/announcements/:id/read` | Mark read | Session | Active member | Double-submit | Covered (`announcements`) |
| member | POST | `/member/ministries/:id/join\|leave` | Join/leave | Session | Active member | Double-submit | Covered (`participation`) |
| member | POST | `/member/events/:id/register\|cancel` | Event RSVP | Session | Active member | Double-submit | Covered |
| member | POST | `/member/forms/:id/submit` | Form submit | Session | Active member | Double-submit | Covered (`forms-requests`) |
| member | POST | `/member/requests` | Create request | Session | Active member | Double-submit | Covered |

### 3.6 Announcements / participation / attendance / giving (mounted)

Prefixes `{P}` ∈ `/hq/…`, `/hq/…/b/:branchKey`, `/branch-admin/…` as registered per module.

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| announcements | POST | `{P}` | Create | Session | HQ/BA roles | `validateCsrfPost` | Covered (`announcements`) |
| announcements | POST | `{P}/:id` | Update | Session | HQ/BA | `validateCsrfPost` | Covered |
| announcements | POST | `{P}/:id/publish` | Publish | Session | HQ/BA | `validateCsrfPost` | Covered |
| announcements | POST | `{P}/:id/archive` | Soft-archive | Session | HQ/BA | `validateCsrfPost` | Covered |
| announcements | GET | `{P}/:id/publish` | Publish **form** only | Session | HQ/BA | N/A (no mutation) | Static (no UPDATE on GET) |
| participation | POST | `{P}/ministries/memberships/:id/review` | Review join | Session | HQ/BA | `validateCsrfPost` | Covered |
| attendance | POST | `{P}` `/…/edit` `/…/entries` `/…/submit` | Create/edit/entries/submit | Session | HQ/BA | `validateCsrfPost` | Covered (`attendance`) |
| attendance | POST | `{P}/:id/approve\|archive` | HQ approve/archive | Session | HQ | `validateCsrfPost` | Covered |
| giving | POST | `{P}` `/…/:id` `/…/submit` `/…/void` `/…/approve` | Manual giving lifecycle | Session | HQ/BA | `validateCsrfPost` | Covered (`giving`) |

### 3.7 Forms / resources / requests (admin)

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| forms-requests | POST | `{P}/resources` (+ `/:id/publish`) | Create/publish resource | Session | HQ/BA | `validateCsrfPost` | Covered |
| forms-requests | POST | `{P}/forms` (+ `/:id/publish`) | Create/publish form | Session | HQ/BA | `validateCsrfPost` | Covered |
| forms-requests | POST | `{P}/requests/:id/status` | Status transition | Session | HQ/BA | `validateCsrfPost` | Covered |

### 3.8 Content + media

| Area | Method | Route | Action | Authentication | Authorization | CSRF mechanism | Test status |
|------|--------|-------|--------|----------------|---------------|----------------|-------------|
| content | POST | `{P}/pages/:pageKey` | Page shell | Session | HQ/BA | `validateCsrfPost` | Covered (`content-admin`) |
| content | POST | `{P}/pages/:pageKey/sections` (+ `/:sectionKey`) | Sections | Session | HQ/BA | `validateCsrfPost` | Covered |
| content | POST | `{P}/{leadership\|ministries\|events\|sermons\|contact\|giving}` | Entities | Session | HQ/BA | `validateCsrfPost` | Covered |
| media | POST | `{P}/media/upload` | Upload | Session | HQ/BA | Body `_csrf` **or** `X-CSRF-Token` | Covered (`media`) |
| media | POST | `{P}/media/:assetId/archive` | Soft-archive | Session | HQ/BA | Same | Covered |

Client: `public/blessboard/v5/media-picker.js` appends `_csrf` and sets `X-CSRF-Token` on upload XHR and archive `fetch`.

---

## 4. Verification checklist

| Check | Result |
|-------|--------|
| Every state-changing form includes CSRF | **PASS** |
| Every state-changing route validates CSRF | **PASS** (POSTs) |
| Logout POST + CSRF | **PASS** |
| Login signed double-submit | **PASS** |
| Tenant registration protected | **PASS** |
| Member profile protected | **PASS** |
| Registration reviews protected | **PASS** |
| Announcements create/update/publish/archive protected | **PASS** (archive = soft-delete; no hard DELETE) |
| Attendance / giving protected | **PASS** |
| Forms / requests protected | **PASS** |
| Media upload/archive protected | **PASS** |
| Platform status/assignment protected | **PASS** |
| No sensitive action via GET | **PASS** for product mutations; transfer GETs are token-bound |
| JS requests include CSRF | **PASS** (media-picker) |
| Validation failure does not bypass CSRF | **PASS** — CSRF checked before business validation in handlers |

---

## 5. Safe fixes made

**None.** No CSRF omissions found; architecture left unchanged.

---

## 6. Remaining ambiguities

| Topic | Note |
|-------|------|
| Tenant `GET /login` + `GET /auth/callback` | State-changing but protected by one-time transfer tokens, not double-submit CSRF — intentional V5 auth design |
| Soft-archive vs delete | Product uses archive POSTs; no HTTP DELETE verbs |
| CSRF before vs after authz | Typical order: host reject → role gate → CSRF → mutate. Unauthenticated POSTs still fail CSRF or auth first; both deny |

---

## 7. Tests

| Suite | Role |
|-------|------|
| `npm run test:blessboard:csrf-action-audit` | Static inventory (new) |
| `npm run test:blessboard:auth` | Login/logout CSRF |
| `npm run test:blessboard:tenant-auth` | Transfer (token) |
| Module suites | settings, member-registration, member-portal, announcements, attendance, giving, forms-requests, media, content-admin, participation, PA/BA/HQ shells |

---

## 8. Suggested commit message

```
Document V5 CSRF action inventory and add static CSRF coverage checks.
```
