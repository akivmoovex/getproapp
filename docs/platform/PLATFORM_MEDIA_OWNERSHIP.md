# Platform media ownership (PC08)

| Field | Value |
|-------|--------|
| **Doc ID** | `PLATFORM_MEDIA_OWNERSHIP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC07 PASS |
| **Runtime bulk migration** | **NONE** |
| **Production** | **NOT TOUCHED** |

Machine-readable architecture guard: `tests/v10-pc08-platform-media-consolidation.test.js`.

---

## 1. Authoritative website media path

```text
Product route / picker chrome
        ↓
src/platform/website/mediaService.js
        ↓
src/platform/media/*  (Hostinger config/storage + CDN presentation)
        ↓
platform.website_media (+ usages / folders)
```

Platform owns:

| Concern | Module |
|---------|--------|
| Storage config / public URL builders | `hostingerMediaConfig.js` |
| Byte persistence (Hostinger FS) | `hostingerMediaStorage.js` |
| CDN / runtime src hydration | `cdnMediaPresentation.js` |
| Marketing asset CDN helpers | `platformMarketingAssets.js` |
| Upload / list / get / replace / remove / ownership | `website/mediaService.js` |
| Folder mechanics | `website/mediaFoldersService.js` |
| Shared library card presentation | `website/libraryModel.js` |
| Shared picker assets | `public/platform/website-media-field.*`, `views/platform/website/partials/media-*` |

Barrel: `src/platform/media/index.js`.

**Do not** invent a second Hostinger/CDN storage factory under product packages for website media.

---

## 2. Product-owned (allowed)

| Product | Concern | Path |
|---------|---------|------|
| BlessBoard | HQ/branch/public website routes & RBAC | `blessboardWebsiteEditorRoutes.js` |
| BlessBoard | Classic CMS / announcements / forms **operational** media (`blessboard.media_assets`) | `src/blessboard/media/*` |
| BlessBoard | Legacy public `/media/...` delivery for operational assets | `publicMediaRoutes.js` |
| ActiveClinic | Clinic CMS chrome & library UI | `activeClinicWebsiteCmsRoutes.js` |
| ActiveClinic | Demo/Stitch catalogue image mapping | `activeClinicPublicMediaService.js` |
| Both | Picker chrome labels / Stitch composition | product views + shared platform field |

Product domain media (BB `media_assets`) is **not** migrated into `platform.website_media` in PC08. No bulk media migration.

---

## 3. Compatibility layers retained

| Layer | Role |
|-------|------|
| `src/blessboard/media/*` | Retained for church operational uploads (announcements, forms, content admin) |
| App-mediated `/c/.../website/media/:id` and `/clinics/.../website/media/:id` | Retained delivery URLs; resolution via platform `mediaService` |
| Legacy DB-backed website rows (`PROVIDER_DATABASE`) | Retained read/hydration path for historical blobs — Hostinger preferred for new uploads |
| AC `/activeclinic/assets/...` paths | Presented via CDN layer; not a second persistence store |

---

## 4. Obsolete / forbidden for website engine

| Pattern | Status |
|---------|--------|
| Product-local Hostinger storage factory for website media | **Forbidden** (guarded) |
| Website library claiming BB `media_assets` as engine store | **Obsolete comment** corrected in `libraryModel.js` |
| Parallel CDN URL builders outside `cdnMediaPresentation` / `mediaService` | **Forbidden** for website engine hydration |
| Bulk rewrite of persisted storage keys / CDN URLs | **Out of scope** |

---

## 5. Non-negotiables

1. Never modify production.
2. Do not bulk-migrate existing Hostinger or DB media unless explicitly scheduled and proven safe.
3. Preserve Hostinger/`MEDIA_STORAGE_ROOT` + CDN presentation behavior.
4. Tenant ownership validation stays inside platform `mediaService` / authorize helpers.
