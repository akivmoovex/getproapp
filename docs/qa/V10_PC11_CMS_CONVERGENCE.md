# V10 PC11 — Classic CMS Convergence

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_PC11_CMS_CONVERGENCE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | `PLATFORM_PUBLICATION_CONVERGENCE_PASS` (PC10) |
| **Deploy / production** | **NOT TOUCHED** |
| **Verdict** | **`PLATFORM_CMS_CONVERGENCE_PASS`** |

Supersedes gate stop: `docs/qa/V10_PC11_CMS_CONVERGENCE_BLOCKED.md` (PC10 was blocked at that time).

---

## 1. Goal

Consolidate **generic** BB/AC CMS mechanisms without a universal content model or product-conditional forests.

```text
Product CMS routes (URLs, auth, chrome, catalogues)
        ↓
Platform CMS mechanisms
  · folder notice / redirect
  · ordered-list draft mutators
  · batch draft persistence
  · editor wantsHtml + prior PC07/PC08/PC10 kit
        ↓
BB classic CMS adapter          AC classic CMS adapter
  · structured drafts             · PAGE/SECTION/BLOCK catalogues
  · operational media             · clinicWebsiteCms* semantics
  · entity catalogues             · library placements / catalogue
```

---

## 2. Shared mechanisms (platform)

| Mechanism | Module | Consumers |
|-----------|--------|-----------|
| Folder notice + redirect | `src/platform/website/http/websiteCmsFolderHttp.js` | BB `contentAdminRoutes`, AC `activeClinicWebsiteCmsRoutes` via adapters |
| Ordered-list draft mutators | `src/platform/website/cmsOrderedListDraft.js` | AC `clinicWebsiteCmsService` (reorder/remove) |
| Batch draft key save | `contentService.saveWebsiteDraftEntries` | AC `saveSiteSettings` |
| HTML Accept preference | `websiteEditorHttpUtils.wantsHtml` | BB content admin media library |
| Prior kit (unchanged ownership) | PC07 editor HTTP · PC08 media · PC10 publication | Draft / media / version / publish / restore |

---

## 3. Retained product adapters

| Adapter | Owns |
|---------|------|
| `blessboardClassicCmsAdapter.js` | BB classic CMS boundary; re-exports folder helpers |
| `activeClinicCmsAdapter.js` | AC classic CMS boundary; folder + ordered-list re-exports |
| `clinicWebsiteCms.js` / `clinicWebsiteCmsService.js` | AC templates, SECTION/BLOCK types, CMS_KEYS, slug/catalogue rules |
| `websiteStructuredDraftService` + `publicContentAdminService` | BB structured drafts + relational CMS |
| `contentAdminRoutes` entity routes | Leaders/ministries/events/sermons/… |
| Operational `blessboard.media_assets` | BB classic library (not website_media merge) |

**No** BB↔AC catalogue merge. **No** unified content schema.

---

## 4. Removed duplication

| Before | After |
|--------|-------|
| Duplicate `folderNoticeMessage` in BB + AC CMS routes | Shared `websiteCmsFolderHttp.folderNoticeMessage` |
| Duplicate folder redirect query shaping | Shared `folderRedirect` |
| Local `wantsHtml` in BB content admin | Shared `websiteEditorHttpUtils.wantsHtml` |
| Inline reorder loops ×3 in `clinicWebsiteCmsService` | `cmsOrderedListDraft.reorderByIds` |
| Inline delete filters | `removeById` |
| Manual loop in `saveSiteSettings` | `saveWebsiteDraftEntries` |

**Not deleted:** classic CMS route files, structured drafts, AC CMS models, operational media paths (still have consumers; parity + rollback not proven for removal).

---

## 5. Intentional remaining duplication

1. **Dual CMS storage models** — BB relational `public_*` + structured drafts vs AC JSON list drafts under `website_content` keys.
2. **Dual media systems** — BB operational `media_assets` vs platform `website_media` (PC08 ownership SoT).
3. **Product catalogues / templates** — deliberately separate.
4. **Library page assembly** — both still call `libraryModel.buildLibraryView` with product copy; `mediaPageModel` remains editor-oriented (`foldersEnabled: false` default).
5. **Publish/submit UX** — BB draft-changes vs AC submit (PC10 adapters).

---

## 6. Tests

| Suite | Result |
|-------|--------|
| `tests/v10-pc11-cms-convergence.test.js` (new) | **PASS** |
| `tests/v10-pc07-shared-website-editor-http.test.js` | **PASS** |
| `tests/v10-pc08-platform-media-consolidation.test.js` | **PASS** |
| `tests/v7-shared-media-folders.test.js` | **PASS** |
| `tests/activeclinic-website-cms.test.js` | **PASS** |
| `tests/blessboard-content-admin.test.js` | **PASS** |
| `tests/v7-classic-cms-media-order-drafts.test.js` | **PASS** |
| `tests/v7-shared-website-editor.test.js` | **PASS** |
| `tests/v10-pc10b-bb-publish-baselines.test.js` | **PASS** |
| `tests/v10-pc10b-ac-website-workflow-baseline.test.js` | **PASS** |
| `tests/blessboard-church-website-publish.test.js` | **PASS** |
| `tests/phase4-publish-website.test.js` | **PASS** |
| `tests/v7-clinic-website-autonomy-acceptance.test.js` | **PASS** |
| `tests/v8-shared-website-sections.test.js` | **PASS** |

No P0/P1 or security regression observed.

---

## 7. Verdict

```text
PLATFORM_CMS_CONVERGENCE_PASS

Prerequisite: PLATFORM_PUBLICATION_CONVERGENCE_PASS
Deploy: NOT TOUCHED
Catalogues merged: NO
Product-conditional forests: NO
Obsolete path deletes: NONE (consumers remain; deferred)
```
