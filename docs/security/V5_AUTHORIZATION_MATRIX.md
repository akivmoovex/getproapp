# BlessBoard V5 — Authorization matrix

**Date:** 2026-07-19
**Source of truth:** `docs/database/ARCHITECTURE.md` (tenant-scoped authorization + shells + media + member portal) · `authorizeBlessBoardTenantAccess` · `requireBlessBoardTenantRole` · `requireActiveMember` · `platformAdminRoutes.requirePlatformAdmin`
**Constraint:** Verification only. Do not broaden access, rename roles, weaken inactive/suspended checks, or add superuser bypasses.

**Related:** [`V5_ROUTE_AND_LINK_AUDIT.md`](../testing/V5_ROUTE_AND_LINK_AUDIT.md) · [`V5_DEMO_E2E_SMOKE_TEST.md`](../testing/V5_DEMO_E2E_SMOKE_TEST.md) · `tests/blessboard-authorization.test.js`

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| Matrix documented against implemented gates? | **YES** |
| Implementation matches ARCHITECTURE role rules? | **YES** (no policy change required) |
| Direct URL access protected (not nav-only)? | **YES** — middleware on GET **and** POST |
| Clear authz defects requiring code change? | **NONE** found in this pass |
| Gaps closed with focused tests? | **YES** (matrix HTTP cases added to authorization suite) |

Legend for cells: **Allow** · **Deny** (401/403/404/unavailable as noted) · **N/A** · **Public**

---

## 2. Principals and scope rules

| Role key | Scope rule (UUID only) |
|----------|------------------------|
| *(none / visitor)* | No privileged grants |
| `member` | Not an admin role. Portal access requires **active user** + **active member** + **active membership** on the hostname **primary** branch. Admin roles alone never grant `/member*`. |
| `branch_admin` | `organizationId` + `churchId` + **assigned `branchId`** must match target. Hostname primary branch must equal assigned branch for BA shell. |
| `church_hq_admin` | `organizationId` + **assigned `churchId`**. All **active** branches of that church. |
| `platform_admin` | Any **active resolved** BlessBoard tenant on this deployment. Still requires resolved tenant; **does not** bypass inactive domain/church/branch gates. Apex `/admin*` only on apex host. |

Comparisons use **UUIDs**, never display names or slugs. Active users + **active** `user_roles` only (`listActiveAuthorizationRoles`).

HTTP mapping (`requireBlessBoardTenantRole`):

| Condition | Status |
|-----------|--------|
| No session / inactive user | **401** |
| Unauthorized / unresolved tenant / wrong role | **403** |
| Authz lookup failure | **503** |

Member portal (`requireActiveMember`): unauthenticated HTML → redirect `/login?next=/member`; otherwise **401** / **403** / **503** as above.

Apex platform admin (`requirePlatformAdmin` + `requireApex`): non-apex → unavailable; non-PA → **403**; unauthenticated HTML → `/login`.

---

## 3. Matrix — route groups × roles

| Area | Route group | Visitor | Member | Branch Admin | HQ Admin | Platform Admin | Scope rule |
|------|-------------|---------|--------|--------------|----------|----------------|------------|
| apex marketing | `GET /` `/features` `/pricing` `/directory` `/register-church` … | Public | Public | Public | Public | Public | Apex anon; no role gate |
| apex auth | `GET/POST /login` `POST /logout` `GET /account` | Login allow; account Deny | Allow (session) | Allow | Allow | Allow | Host-only session; logout CSRF |
| apex platform admin | `GET/POST /admin*` | Deny → login | Deny **403** | Deny **403** | Deny **403** | Allow (apex only) | Apex + active `platform_admin`; tenant host → unavailable |
| tenant public CMS | `GET /` `/about` … `/giving` | Public* | Public* | Public* | Public* | Public* | *Authoritative + published; `website_status=suspended` → controlled unavailable (not role grant) |
| tenant registration | `GET/POST /register` | Allow | Allow | Allow | Allow | Allow | Anon CSRF; no admin privilege |
| tenant transfer | `GET /login` `GET /auth/callback` | Transfer | Transfer | Transfer | Transfer | Transfer | Opaque `tr`; host-only cookie |
| diagnostic | `GET /tenant-access-check` | Deny **401** | Deny **403**† | Allow if branch match | Allow if church match | Allow if tenant resolved | †Member without admin role |
| branch admin shell | `GET /branch-admin` `/account` `/settings` | Deny | Deny **403** | Allow (assigned branch) | Allow (own church primary) | Allow (resolved active tenant) | Primary branch from hostname; query branch IDs ignored |
| branch admin modules | `/branch-admin/{registrations,members,announcements,participation,attendance,giving,resources,forms,requests,content}…` | Deny | Deny | Allow (assigned) | Allow (own church) | Allow (resolved) | Same gate + module routes; POST uses same `allowedRoles` |
| branch mutations | `POST` approve/reject/settings/content/media… | Deny | Deny | Allow (assigned) | Allow | Allow | Authz **before**/with CSRF; CSRF alone never grants |
| HQ shell | `GET /hq` `/branches` `/account` `/settings` `/reports` `/audit` … | Deny | Deny **403** | Deny **403** | Allow (own church) | Allow (resolved) | `branch_admin` never HQ |
| HQ branch jump | `GET /hq/branches/:branchKey` | Deny | Deny | Deny | Allow → `/branch-admin` if active | Allow if active | Inactive/unknown key → controlled **404** |
| HQ mutations | `POST /hq/settings` + HQ module POSTs | Deny | Deny | Deny **403** | Allow | Allow | POST gated independently of GET |
| member portal | `GET/POST /member*` | Deny → login | Allow (membership) | Deny **403**‡ | Deny **403**‡ | Deny **403**‡ | ‡Unless also active member on primary |
| member mutations | `POST` profile / join / leave / forms / requests | Deny | Allow (scoped) | Deny | Deny | Deny | Membership + church scope |
| public media | `GET /_bb/media/:assetId` | Public assets only | Same | Same | Same | Same | Church from hostname; private → **403**; cross-tenant → **403** |
| admin media | `{P}/media` upload/list/archive/preview | Deny | Deny | Allow (BA `{P}`) | Allow (HQ `{P}`) | Allow | `churchId` on every op; private preview only when authorized |
| attachments | forms/requests file GET | Deny | Own church + ownership | Church-scoped admin | Church-scoped admin | Church-scoped admin | Same church UUID; private storage |

---

## 4. Context matrix (status / identity)

| Context | Expected privileged access | Enforcement |
|---------|---------------------------|-------------|
| Apex host | `/admin*` for PA; marketing/auth; **not** tenant CMS/portals via relative `/hq` | `requireApex`; account page hostKind gate |
| Correct tenant hostname | Resolved org/church/primary → grants evaluate | Catalogue + `authorizeBlessBoardTenantAccess` |
| Wrong tenant hostname | HQ/BA of other org → **403** | Church/org UUID mismatch |
| Correct church | HQ grants | `church_hq_admin.churchId` |
| Wrong church | **403** | UUID mismatch |
| Correct branch | BA grants when hostname primary = assigned | `branch_admin.branchId` |
| Wrong branch | Campus BA on HQ-primary host → **403** | Branch UUID mismatch |
| Active user | Eligible | `users.status = active` |
| Inactive user | **401** (no privileged access) | Authz + session reader |
| Active role | Eligible | `user_roles.status = active` |
| Inactive/suspended role | **403** | Filtered out of role list |
| Active branch | Eligible target | `isActiveBranchOfChurch` |
| Inactive branch | HQ jump **404**; not listable; BA cannot use as live primary | Branch status + HQ list filter |
| Active church | Eligible | Join on church `active` in branch check |
| Suspended website (`church_settings.website_status`) | Public site unavailable; **not** a role bypass | Public page model (`website_suspended`) |
| Inactive domain / unresolved host | Protected routes **403**; public foundation/unavailable per routing mode | No resolved tenant |
| Wrong deployment session | **401** | Session `deployment_code` must match app |
| Revoked / expired session | **401** | `revoked_at` / `expires_at` on `deployment_sessions` |
| Stale V4 `security_version` | **N/A on V5** | V5 uses deployment session revoke/expiry + inactive user — not V4 `security_version` |

---

## 5. Verification checklist (task requirements)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Member cannot access branch/HQ/platform admin | **PASS** | Matrix tests: member → `/branch-admin`, `/hq`, `/admin` denied |
| Branch admin cannot access another branch | **PASS** | Authz suite campus-on-primary **403** |
| Branch admin cannot access another church | **PASS** | Wrong-tenant host **403** (HQ suite / settings) |
| HQ admin only assigned church + its branches | **PASS** | Own **200**, other church **403**; branch jump own church only |
| Platform admin tenant-status restrictions | **PASS** | Resolved active tenants only; inactive domain → **403** (matrix test); no inactive-gate bypass |
| Inactive users no privileged access | **PASS** | **401** on `/tenant-access-check` |
| Suspended roles grant no access | **PASS** | **403** |
| Inactive branch restrictions | **PASS** | HQ shell controlled **404** |
| Suspended church/website restrictions | **PASS** (public) | Public-pages suite `website_suspended`; role engine still requires active church via branch join |
| Stale sessions rejected where required | **PASS** | Revoked/expired/wrong-deployment → **401** (sessions + matrix) |
| Direct URL protected | **PASS** | Middleware on routes; not nav-only |
| Media/attachments same scope | **PASS** | Media suite cross-tenant / private / CSRF |
| POST authz independent of GET | **PASS** | Matrix: BA `POST /hq/settings` **403**; settings suite CSRF **403** without token |

---

## 6. Policy ambiguities (no code change)

| Topic | Note |
|-------|------|
| `platform_admin` org on role row | Grant ignores role `organizationId` (deployment-wide) — documented intentional |
| `authorizeBlessBoardTenantAccess` with `branchId: null` | Skips `isActiveBranchOfChurch`; HTTP always supplies primary branch — do not call service without branch for privileged gates |
| Website suspended vs church status | `website_status` gates public render; church `status` gates catalogue/branch join — keep both |
| PA on member portal | Denied unless separate active membership — intentional |

---

## 7. Test map

| Suite | Covers |
|-------|--------|
| `npm run test:blessboard:authorization` | Unit grants + HTTP matrix (incl. new cases) |
| `test:blessboard:hq-shell` / `branch-admin-shell` / `platform-admin-shell` | Shell role filters, inactive branch, apex PA |
| `test:blessboard:member-portal` | Membership gate; BA-only denied on `/member` |
| `test:blessboard:settings` | BA cannot church settings; POST CSRF |
| `test:blessboard:media` | Private/public/cross-tenant/archive |
| `test:platform:sessions` | Revoked/expired/inactive deployment |
| `test:blessboard:public-pages` | `website_suspended` |

---

## 8. Suggested commit message

```
Document V5 authorization matrix and close focused authz coverage gaps.
```
