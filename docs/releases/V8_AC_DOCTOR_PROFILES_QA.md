# V8 ActiveClinic doctor public profiles QA

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_AC_DOCTOR_PROFILES_QA_PASS`

## Gap addressed

Public catalogue doctors previously only supported show/hide against existing staff rows.
There was no catalogue create/edit/delete for public professional profiles (name, title/specialty,
biography, photo) without creating a staff login.

## Implementation

| Layer | Path |
|-------|------|
| Service | `clinicWebsiteCatalogueService.js` (`create` / `update` / `delete` / visibility) |
| Overlay photo | `clinicWebsiteLibraryService.upsertOperationalOverlay` accepts CDN media fields |
| Routes | `/app/settings/website/catalogue/doctors/new\|:id/edit\|:id/delete` |
| UI | `website-cms-catalogue-doctor-form.ejs` + catalogue Add doctor profile |
| Public | `listPublicStaffProfiles` → `/clinics/:key/doctors/:staffKey` |
| Tests | `tests/v7-website-public-catalogue.test.js` |

## Guarantees

- Create never sets `platform_identity_id` (no login).
- Delete archives public-only profiles; for staff with login, unpublishes only.
- Tenant isolation via organization + HCO scoped queries.
- Only `public_profile_enabled` + active + published website content appear publicly.

## Automated results

| Suite | Result |
|-------|--------|
| `tests/v7-website-public-catalogue.test.js` | **5/5 PASS** |

## Hosted disposable E2E (`ac-hqa-*`)

| Check | Result |
|-------|--------|
| Hosted SHA | `b2ae668690a2` · `moovex-platform-v8-testing` |
| Staff login | **303** → `/app` · session cookie set |
| Catalogue list | **200** · Add doctor profile |
| Create profile | **303** · no `platform_identity_id` · public page shows name |
| Public detail + image | **200** · bio + image rendered |
| Edit name/specialty/bio | **303** · DB + public page updated |
| Unpublish | `public_profile_enabled=false` · removed from public doctors |
| Delete public-only | `status=archived` |
| Cross-clinic edit | **404** (no leak) |
| Unauthenticated new | **303** → `/login` |
| Re-login | catalogue reachable |
| V7 Julflona `/doctors` | **200** (compat) |
| Cleanup | org purged after E2E |

Evidence: `/tmp/v8-ac-doctors/hosted-result.json`

## Production

Untouched.
