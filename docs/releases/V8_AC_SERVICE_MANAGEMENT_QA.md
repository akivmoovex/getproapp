# V8 ActiveClinic service management QA

**Recorded:** 2026-09-20  
**Branch:** `V8`  
**Priority:** P1  
**Final status:** `V8_AC_SERVICE_MANAGEMENT_QA_PASS`

## Root cause

BUG-003 was **not** a service-table or catalogue-route defect. Staff never reached `/app/settings/website/catalogue?tab=services` on hosted V8 because session creation failed (`platform.deployments` missing `moovex-platform-v8-testing`).

That catalogue row was added in `3de1d0ad` (Prompt 03). With it present:

- Staff login sets `moovex_platform_v8_testing_sid`
- Catalogue CRUD routes authorize normally
- Existing `appointment_service_types` + website catalogue services work end-to-end

No change to the AC service data model or V7 API shape was required.

## Infrastructure reused

| Layer | Path |
|-------|------|
| Table | `activeclinic.appointment_service_types` |
| Service | `clinicWebsiteCatalogueService.js` (`create` / `update` / visibility) |
| Routes | `/app/settings/website/catalogue/services/new\|:id/edit` |
| Public | `listPublicServices` → `/clinics/:key/services` |
| Tests | `tests/v7-website-public-catalogue.test.js` |

## Automated results

| Suite | Result |
|-------|--------|
| `tests/v7-website-public-catalogue.test.js` | **4/4 PASS** |

## Hosted disposable E2E (`ac-hqa-*`)

| Check | Result |
|-------|--------|
| Hosted SHA | `102893739609` · `moovex-platform-v8-testing` |
| Staff login | **303** → `/app` · session cookie set |
| Catalogue list | **200** |
| Create service | **303** · row persisted · public page shows name |
| Edit name/duration | **303** · DB + public page updated |
| Disable / hide | `status=inactive` · removed from public services |
| Cross-clinic edit | **404** (no leak) |
| Unauthenticated new | **303** → `/login` |
| Re-login persistence | catalogue still lists edited service |
| V7 Julflona `/services` | **200** (compat) |
| Cleanup | org purged |

Evidence: `/tmp/v8-ac-services/hosted-result.json`

## Code note in this commit

Service-key HTML pattern aligned with backend `SERVICE_KEY_RE` (hyphens only; underscores are still normalized server-side via `serviceKeyFromName`).

## Production

Untouched.
