# V10 PC08 — Platform Media Consolidation

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC08_PLATFORM_MEDIA_CONSOLIDATION` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC07 PASS |
| **Verdict** | **`PLATFORM_MEDIA_CONSOLIDATION_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |
| **Bulk media migration** | **NOT PERFORMED** |

Ownership SoT: [`docs/platform/PLATFORM_MEDIA_OWNERSHIP.md`](../platform/PLATFORM_MEDIA_OWNERSHIP.md).

---

## 1. Goal

One authoritative **website** media storage/persistence mechanism:

```text
src/platform/media/*
src/platform/website/mediaService.js
```

Platform owns storage, persistence mechanics, URL/hydration, generic validation, tenant-safe ownership.  
Products may own catalogue presentation, picker chrome, and domain associations.

---

## 2. Authoritative path (unchanged runtime behavior)

| Concern | Owner |
|---------|--------|
| Hostinger config / public URL builders | `platform/media/hostingerMediaConfig.js` |
| Byte storage | `platform/media/hostingerMediaStorage.js` |
| CDN / runtime src presentation | `platform/media/cdnMediaPresentation.js` |
| Upload / list / get / replace / remove / hydrate / ownership | `platform/website/mediaService.js` |
| Folders | `platform/website/mediaFoldersService.js` |
| Shared library cards | `platform/website/libraryModel.js` |
| Shared picker assets | `public/platform/website-media-field.*`, `views/platform/website/partials/media-*` |

Barrel: `src/platform/media/index.js`.

BB + AC website editor / CMS routes already call `mediaService` (no product Hostinger factories).

---

## 3. Obsolete paths / compatibility retained

| Path | Status | Notes |
|------|--------|-------|
| `src/blessboard/media/*` | **Retained** (compatibility) | Operational church media (`blessboard.media_assets`) for announcements / forms / classic content admin — **not** website-engine storage |
| `publicMediaRoutes.js` + BB upload service | **Retained** | Delivers operational assets |
| Legacy `PROVIDER_DATABASE` website rows | **Retained** | Historical blobs; new uploads prefer Hostinger |
| AC `activeClinicPublicMediaService.js` | **Retained** | Catalogue/demo presentation only; CDN via platform |
| App-mediated `/c/.../website/media/:id` and `/clinics/.../website/media/:id` | **Retained** | Delivery URLs resolved through platform `mediaService` |
| Comment claiming BB website library uses `media_assets` | **Removed/corrected** | `libraryModel.js` now documents platform `website_media` ownership |
| Product-local Hostinger storage for website media | **Forbidden** | Architecture guard |

**No paths deleted** that still serve operational or historical traffic. No bulk rewrite of storage keys or CDN URLs.

---

## 4. Compatibility / dependency layers added

| Change | Role |
|--------|------|
| `src/platform/media/index.js` | Documented barrel for Hostinger/CDN helpers |
| `registerBlessBoardOperationalMediaStorageFactory` in `productRuntimeRegistry` | Inverts platform testing-reset → BB operational storage hard-require |
| BB bootstrap registers `createMediaStorage` | Product owns operational storage factory |
| `testingDataResetService` uses registry | Cleanup of `blessboard.media_assets` local files without platform→BB require |
| PC03 allowlist | Removed `services/testingDataResetService.js` (one fewer Class E exception) |

`v5FoundationServer` still constructs BB operational `createMediaUploadService` as a **composition root** (Class E, unchanged).

---

## 5. Tests

### Architecture + media + website + tenant isolation (gate)

```text
tests/v10-pc08-platform-media-consolidation.test.js   PASS
tests/v10-pc03-platform-product-dependency-direction.test.js  PASS
tests/v10-pc02-platform-consolidation-characterization.test.js PASS
tests/v7-hostinger-media-storage.test.js              PASS
tests/v8-shared-media-resolution.test.js              PASS
tests/v7-shared-content-media-library.test.js         PASS
tests/v7-shared-media-folders.test.js                 PASS
tests/v7-website-image-management.test.js             PASS
tests/blessboard-media.test.js                        PASS
tests/v7-shared-website-editor.test.js                PASS
tests/v7-shared-website-authorization-entrypoint.test.js PASS
tests/v8-shared-rbac-tenant-isolation.test.js         PASS
```

**Gate result:** all of the above green (`PLATFORM_MEDIA_CONSOLIDATION_PASS`).

### Known pre-existing drifts (not PC08 regressions)

| Suite | Issue |
|-------|--------|
| `activeclinic-pass6-media` | Asserts legacy `/activeclinic/assets/...` paths; runtime correctly returns CDN URLs when CDN env is set |
| `v2-shared-media-upload-parity` | UI string / cache-bust contract drift (documented in PC01 Suite B) |

---

## 6. Verdict

```text
PLATFORM_MEDIA_CONSOLIDATION_PASS
```

Website media has a single platform-owned persistence/hydration path; Hostinger/CDN behavior preserved; BB operational media retained behind a clear compatibility boundary; no bulk migration; production untouched.
