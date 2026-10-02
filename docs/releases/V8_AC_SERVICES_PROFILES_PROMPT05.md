# V8 PROMPT 05 — AC services and doctor profiles

**Branch:** `V8` only  
**Verdict:** `V8_AC_SERVICES_PROFILES_CODE_PASS`  
**Date:** 2026-09-21  
**Hosts:** Code + local automated tests only (no deploy / hosted writes)

## Audit summary

| Area | Status |
|------|--------|
| Data model | `appointment_service_types` + `staff_members` public profile fields (no login on catalogue create) |
| Catalogue CRUD | `/app/settings/website/catalogue/services|doctors` via `clinicWebsiteCatalogueService` |
| RBAC | `website.edit` for writes; receptionist denied |
| Ownership | Queries scoped by `organization_id` + `healthcare_organization_id` |
| Publish | Website draft → `publishWebsiteDraft`; public list/detail read live CMS library |
| Stitch (public) | Project `17813606734422395399` — Juflona/Demo Services & Doctor Profile screens (presentation already mapped) |

Prior QA classified BUG-003/004 as fixed after V8 session/deployment catalogue repair. This prompt closed remaining **public photo/display** gaps.

## Defects fixed

1. **Doctor (and service) detail public pages** did not apply CMS library presentation, so operational overlay photos/summaries never reached `/doctors/:staffKey` (and service detail icons/summaries).
2. **Empty catalogue image fields** on save/visibility/feature toggles could wipe an existing operational overlay photo via `...input` spread into `upsertOperationalOverlay`. Overlay updates now sanitize empty `image*` keys.

## Flows covered

### A. Services
Create → Edit → Save → Publish → Public `/clinics/:key/services` (+ detail presentation)

### B. Doctor profiles
Create (no `platform_identity_id`) → Edit → Upload/select photo → Visibility → Publish → Public list + detail with photo

## Tests

| Suite | Result |
|-------|--------|
| `tests/v7-website-public-catalogue.test.js` | **6/6 PASS** (includes photo persist + public render) |

## Non-goals

- Hosted disposable E2E write retest (overnight rule 10)
- Visual Stitch parity polish beyond functional public display
- Applying new migrations

## Preserve V7

No V7 API shape changes; catalogue create still leaves login identities null for public-only doctor profiles.
