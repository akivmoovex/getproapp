# V8 P0/P1 QA Defect Closure (PROMPT 02)

**Verdict:** `V8_QA_DEFECTS_CODE_PASS`  
**Branch:** `V8` only @ `f36af4af` (synced with `origin/V8` before work)  
**Date:** 2026-09-21  
**Input:** [`V8_IMPLEMENTATION_BASELINE.md`](./V8_IMPLEMENTATION_BASELINE.md) §E + prior overnight CODE_PASS ancestry  
**Runtime code changes:** **none** (all five AC defects + shared media already fixed on tip)  
**Hosted verification:** **not claimed** (overnight rule 15 / no hosted writes)

Known Hostinger media settings **unchanged** (not modified in this prompt):

- `MEDIA_STORAGE_ROOT=/home/u549637099/moovex-media`
- `MEDIA_PUBLIC_BASE_URL=/media`
- `MEDIA_PUBLIC_MOUNT_PATH=/media`

No media migration or deletion performed.

---

## Method

For each defect:

1. Confirm fix commit is an ancestor of tip.
2. Re-run safe local disposable-fixture tests (no hosted POSTs).
3. Record root cause from prior closure docs (no re-implementation).
4. Fix only if still open → **none open**.
5. Regression coverage already present; suite re-verified.
6. V7 paths preserved (compatibility covered by existing suites).

**Focused local run (this prompt):** **81/81 PASS**  
Files: `activeclinic-public-booking`, `activeclinic-public-website`, `v7-shared-phone-identity`, `activeclinic-account-lifecycle`, `v7-website-public-catalogue`, `activeclinic-clinic-directory`, `v8-shared-media-resolution`.

---

## Defect matrix

| # | Defect | Tip contains fix? | Local reproduce? | Root cause (historical) | Action this prompt | Classification |
|---|--------|-------------------|------------------|-------------------------|--------------------|----------------|
| 1 | Booking / inquiry submission | Yes `9a0c3045` (+ BUG-001 ancestry) | **No** — tests PASS | Rate-limit on wizard nav; inquiry facility ownership / confirmation copy gaps | None (reuse) | **ALREADY_FIXED** |
| 2 | Duplicate staff phone registration | Yes `f5515341` | **No** — tests PASS | Cross-principal phone claim without shared identity gate | None (reuse) | **ALREADY_FIXED** |
| 3 | Service CRUD + public display | Yes `f297e531` | **No** — tests PASS | Catalogue photo/overlay + public render gaps | None (reuse) | **ALREADY_FIXED** |
| 4 | Doctor profile CRUD + public display | Yes `f297e531` | **No** — tests PASS | Same catalogue path; photo persist | None (reuse) | **ALREADY_FIXED** |
| 5 | Directory → clinic navigation | Yes `bb1ab5e9` | **No** — tests PASS | Non-canonical clinic URLs / fail-open invalid keys | None (reuse) | **ALREADY_FIXED** |
| — | Shared BB/AC media | Yes `f52ee500` + tests `d587615d` | **No** — tests PASS | Soft-fill `testing-v8/platform` + V7 CDN fallback on V8 | None (reuse) | **ALREADY_FIXED** |

None **REPRODUCED**. None required a new code fix. None **BLOCKED** by missing platform identity/media primitives.

---

## Per-defect notes

### 1. Booking / inquiry

| Field | Value |
|-------|-------|
| Service / routes | `activeClinicPublicContactService`, `activeClinicPublicRoutes` booking + contact |
| Prior report | [`V8_AC_BOOKING_INQUIRY_PROMPT03.md`](./V8_AC_BOOKING_INQUIRY_PROMPT03.md) |
| Tests | Booking rate-limit + submit ownership; inquiry facility_id + isolation |
| V7 | Wizard + idempotent retry + inquiry duplicate window preserved |

### 2. Duplicate staff phone

| Field | Value |
|-------|-------|
| Platform fix | `platformIdentityService` shared uniqueness / password-verified multi-org reuse |
| Prior report | [`V8_SHARED_PHONE_IDENTITY_PROMPT04.md`](./V8_SHARED_PHONE_IDENTITY_PROMPT04.md) |
| Tests | `v7-shared-phone-identity` + AC account lifecycle |
| Note | Unique-all-phones migration still deferred; advisory locks remain |

### 3–4. Services & doctor profiles

| Field | Value |
|-------|-------|
| Service | `clinicWebsiteCatalogueService` + public catalogue routes |
| Prior report | [`V8_AC_SERVICES_PROFILES_PROMPT05.md`](./V8_AC_SERVICES_PROFILES_PROMPT05.md) |
| Tests | `v7-website-public-catalogue` CRUD + public photo persist |

### 5. Directory navigation

| Field | Value |
|-------|-------|
| Fix | Canonical clinic detail URLs + fail-closed invalid keys |
| Prior report | [`V8_AC_DIRECTORY_NAVIGATION_PROMPT06.md`](./V8_AC_DIRECTORY_NAVIGATION_PROMPT06.md) |
| Tests | `activeclinic-clinic-directory` |

### Shared media (V7 reads / V8 writes)

| Requirement | Status on tip |
|-------------|---------------|
| Read existing V7 objects under `testing/…` | Present (`resolveMediaReadEnvironment` / soft-fill) |
| New V8 writes under `testing-v8/…` | Present (`forWrite: true` / `resolveMediaEnvironment`) |
| Relative `/media` public base + Hostinger root | Honored by `hostingerMediaConfig` / `cdnMediaPresentation` — **values not changed** |
| No delete/migrate of existing media | Observed (no media ops this prompt) |
| Prior report | [`V8_SHARED_MEDIA_DELIVERY_PROMPT02.md`](./V8_SHARED_MEDIA_DELIVERY_PROMPT02.md) (prior overnight wave) |

---

## What was not done (intentional)

- No speculative Hostinger env edits  
- No media migrate/delete  
- No hosted POST / staff CRUD / upload retests  
- No deploy, restart, or DB migration apply  

Hosted re-verification remains an **operator** follow-up after deploy.

---

## Changed files (this prompt)

- `docs/releases/V8_QA_DEFECTS_PROMPT02.md` (this file)  
- `docs/releases/V8_OVERNIGHT_EXECUTION_REPORT.md` (append)

No `src/` or `tests/` changes required.
