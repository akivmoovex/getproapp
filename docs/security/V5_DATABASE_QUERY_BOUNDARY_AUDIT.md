# BlessBoard V5 — Database query boundary audit

**Date:** 2026-07-19  
**Constraint:** Read-only architecture audit + clear scope-defect fixes only. No schema changes, no DAL rewrite, no query “optimization.”  
**Companions:** [`V5_AUTHORIZATION_MATRIX.md`](./V5_AUTHORIZATION_MATRIX.md) · [`V5_TENANT_RESOLUTION_INTEGRITY.md`](./V5_TENANT_RESOLUTION_INTEGRITY.md) · [`V5_MEDIA_ATTACHMENT_SECURITY_AUDIT.md`](./V5_MEDIA_ATTACHMENT_SECURITY_AUDIT.md)

---

## 1. Verdict

| Question | Answer |
|----------|--------|
| V5 repos use `blessboard.*` / `platform.*` only (no `public.tenants` / `public.session`)? | **YES** |
| Tenant lists generally filter `church_id` (+ branch where required)? | **YES** |
| Cross-church HTTP IDOR confirmed? | **NO** (services compare `churchId` after UUID load) |
| Branch-admin church-wide mutation gap? | **YES — fixed** (forms/resources) |
| Schema / routing mode changed? | **NO** |

---

## 2. Query modules reviewed

| Module | Role |
|--------|------|
| `announcementsRepository` | Admin/member announcements + attachments |
| `attendanceRepository` / `givingRepository` | Branch/HQ aggregates + entries |
| `formsRequestsRepository` | Resources, forms, submissions, requests |
| `participationRepository` | Ministries/events memberships |
| `publicContentRepository` | Pages/sections/entities |
| `memberIdentityRepository` | Members, registrations, memberships |
| `blessBoardSettingsRepository` / auth / authorization / catalogue / branch | Settings + identity |
| `mediaAssetsRepository` | Upload metadata, list, archive |
| Platform: `domainRepository`, `entitlementRepository`, `platformAdminRepository`, `authTransferRepository`, `auditEventRepository` | Host/product/deployment/org admin |

---

## 3. Scope patterns found

| Pattern | Where |
|---------|--------|
| List: `church_id = $1` (+ optional `branch_id` / `IS NULL` / OR member visibility) | Announcements, giving, attendance, forms, content, media list |
| UUID load → service `entity.churchId === input.churchId` → mutate by id | Giving, attendance, forms, announcements (when `churchId` passed) |
| Branch ownership via `findBranchScope` / `isActiveBranchOfChurch` | Multiple services |
| Soft-archive media: `WHERE id = $1 AND church_id = $2` | Media (strong) |
| Church-wide denied for branch mode | Announcements, participation; **forms/resources now match** |
| Platform admin lists | Intentionally deployment/product-wide (not church tenant APIs) |

---

## 4. Potential unscoped queries (defense-in-depth)

| Query | Note |
|-------|------|
| Many `find*ById` / `UPDATE … WHERE id = $1` | Rely on service church check; HTTP always passes scope today |
| Announcement `updateAnnouncement` optional `churchId` | Footgun if caller omits tenant; HTTP does not |
| `loadMediaBytes` without church/viewerChurch | All HTTP paths set `viewerChurchId` |
| Content admin service updates | Scope enforced in HTTP `verifyEntityScope` |

These are **not** confirmed HTTP IDORs; prefer adding `AND church_id = $n` on writes in a later hardening pass.

---

## 5. Confirmed defects

| Defect | Impact |
|--------|--------|
| `formsRequestsService.assertAdminScope` allowed branch mode when `entity.branchId == null` | Same-church branch admin could publish/update **church-wide** forms/resources |

---

## 6. Fixes and regression tests

**Fix:** `assertAdminScope` now returns `church_wide_denied` for branch mode when the entity is church-wide; still rejects mismatched branch IDs.

**Regression:** `tests/blessboard-forms-requests.test.js` — HQ creates church-wide resource/form; campus/HQ-branch admin publish denied; HQ publish succeeds.

---

## 7. Remaining risks

| Topic | Note |
|-------|------|
| Post-fetch authz pattern | Prefer SQL scope on UPDATE/DELETE for belt-and-suspenders |
| Platform admin directory | Cross-org by design for platform_admin |
| Church-wide **read** lists for branch admins | Product policy may still show HQ content in some UIs; mutate is denied |
| No legacy tenant ID columns in V5 repos | Verified by absence of `public.tenants` / `public.session` usage |

---

## 8. Suggested commit message

```
Deny branch-admin mutation of church-wide forms/resources and document query boundaries.
```
