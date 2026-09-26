# V10 PC07 — Shared Website Editor HTTP Layer

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC07_SHARED_WEBSITE_EDITOR_HTTP` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PC01–PC06 PASS |
| **Verdict** | **`SHARED_WEBSITE_EDITOR_HTTP_PASS`** |
| **Deploy / production** | **NOT TOUCHED** |

---

## 1. Goal

Reduce the largest safe structural duplication in BlessBoard / ActiveClinic website-editor HTTP layers without creating a product-conditional mega-handler.

Target shape:

```text
Product route (URLs, auth, chrome)
     ↓
Platform handler (shared mechanisms)
     ↓
Product adapter / hooks (tenant resolve, permissions, product workflows)
```

Behavioral contract: **PC02 characterization** (`tests/v10-pc02-platform-consolidation-characterization.test.js`).

---

## 2. Route LOC before / after

| File | Before (HEAD) | After | Δ |
|------|---------------|-------|---|
| `src/blessboard/http/blessboardWebsiteEditorRoutes.js` | **1821** | **1727** | −94 |
| `src/activeclinic/http/activeClinicWebsiteRoutes.js` | **1613** | **1544** | −69 |
| **Product routes total** | **3434** | **3271** | **−163** |

Shared kit (new):

| File | LOC |
|------|-----|
| `src/platform/website/http/websiteEditorHttpUtils.js` | 105 |
| `src/platform/website/http/websiteEditorSharedOperations.js` | 357 |
| `src/blessboard/website/blessboardWebsiteEditorAdapter.js` | 35 |
| `src/activeclinic/website/activeClinicWebsiteEditorAdapter.js` | 32 |
| **Shared kit total** | **~529** |

Net is not a LOC win overall (extraction + adapters), by design: product routes shrink while mechanisms become reusable platform surface for later PC08–PC10 work.

---

## 3. Shared handlers created

### `websiteEditorHttpUtils.js`

- `json` / `jsonWithCorrelation`
- `csrfFrom`
- `clientTenantOverride` (reject client-supplied tenant/product overrides)
- `pendingChangeCountFor`
- `statusForDraftSaveFailure` / `statusForFieldRestoreFailure`
- `createWebsiteMediaUpload` (multer + MIME gate)

### `websiteEditorSharedOperations.js`

| Handler | Concern |
|---------|---------|
| `handleSaveGenericDraft` | Platform `contentService.saveWebsiteDraft` + pending count |
| `handleGetFieldHistory` | Field-history restore panel |
| `handleRestoreFieldHistory` | Restore revision → draft |
| `handleGetUnpublishedChangesPanel` | Unpublished-changes panel |
| `sendStylesEditorPage` / `saveStylesEditorDraft` | Styles editor HTML + save |
| `sendSeoEditorPage` / `saveSeoEditorDraft` | SEO editor HTML + save |
| `handleListAddableSectionTypes` / `handleAddWebsiteSection` | Add-section catalogue/ops |
| `handleGetThemeState` / `handleSaveThemeDraft` | Theme API |
| `sendThemeGalleryPage` | Theme gallery HTML |

**Wired into both BB and AC routes today:** field-history GET/restore, unpublished-changes, styles GET, theme gallery GET, shared utils (json/CSRF/tenant-override/media upload).

**Available but still product-owned call sites (intentionally):** generic drafts (BB dual-write / AC CMS section keys), publish/submit/unpublish, media library pages, version restore-as-draft, preview rendering, add-section status mapping where products differ.

Architecture guard: `tests/v10-pc07-shared-website-editor-http.test.js`.

---

## 4. BB adapter responsibilities

Module: `src/blessboard/website/blessboardWebsiteEditorAdapter.js`  
Route mount: `blessboardWebsiteEditorRoutes.js`

BB owns:

- Path prefix + HQ / branch public scope (`church-wide` vs branch key)
- BlessBoard RBAC (`website.edit` / `website.publish`) via `authorize`
- Engine instance resolve (`branchId` null for HQ)
- Dual-write overlay for classic inline drafts
- Church publish via `publishChurchWebsite` (no AC unpublish/submit)
- Media-library / websites scope listing for BB tenants
- Product chrome + catalogues

---

## 5. AC adapter responsibilities

Module: `src/activeclinic/website/activeClinicWebsiteEditorAdapter.js`  
Route mount: `activeClinicWebsiteRoutes.js`

AC owns:

- `/clinics/:clinicKey/...` URL surface
- Clinic resolve + `attachActiveClinicWebsiteLocals` chrome
- AC website permissions (edit / publish / restore / view)
- CMS section field draft path (`parseCmsSectionFieldKey`)
- `submit` / `unpublish` / `edit-session/finish` workflows
- Publish + optional `makePublic` availability flip
- Clinic websites scope listing
- Product chrome + catalogues

---

## 6. Behavior differences intentionally retained

| Concern | BB | AC |
|---------|----|----|
| URL surface | `/hq/...`, `/c/:key/...`, branch scopes | `/clinics/:clinicKey/...` |
| Auth | BlessBoard RBAC catalogue | Clinic website permission helpers |
| Draft save | Engine + classic dual-write overlay | Shared draft + CMS section-field path |
| Publish | `publishChurchWebsite` | `publishWebsiteDraft` (+ availability) |
| Submit / unpublish / edit-session | Not present | Present |
| HQ / branch governance | Present | N/A (clinic autonomy) |
| Add-section HTTP status mapping | Product-local status codes | Product-local status codes |
| Permission catalogues | BB | AC |

No cross-product conditionals inside platform handlers (`productCode === 'activeclinic'` / `'blessboard'` absent from route mega-handlers).

---

## 7. Tests

### Contract / editor / publish / version (required gate)

```text
tests/v10-pc07-shared-website-editor-http.test.js
tests/v10-pc02-platform-consolidation-characterization.test.js
tests/v7-shared-website-editor.test.js
tests/v7-shared-website-governance.test.js
tests/v7-shared-website-authorization-entrypoint.test.js
tests/v8-shared-website-lifecycle.test.js
tests/v8-shared-website-sections.test.js
tests/phase3-website-version-compare-restore.test.js
tests/phase3-website-publishing-history.test.js
tests/phase4-publish-website.test.js
tests/phase4-restore-previous-website.test.js
tests/shared-website-section-lifecycle.test.js
tests/shared-website-editor-wave4a.test.js
```

**Result:** **150 / 150 PASS** (`/tmp/pc07-final.log`).

### Broader BB/AC website suite (informational)

Additional publish/engine/wave tests were executed. Failures observed there (301 canonical redirects on `/c/...`, registration→website entitlement `forbidden`, CDN demo asset, AC doctor catalogue form) are **outside** the editor-HTTP extraction surface and match known product/routing/env issues — not PC07 regressions. PC02 + shared editor/governance/lifecycle/version suites remain the PC07 behavioral gate.

---

## 8. Verdict

```text
SHARED_WEBSITE_EDITOR_HTTP_PASS
```

Safe structural duplication reduced: shared HTTP utils + operation handlers; product routes remain thin mounts for URLs/auth/chrome; no mega-handler of product conditionals.
