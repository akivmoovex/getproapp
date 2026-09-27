# V10 PL05 — Canonical CMS

| Field | Value |
|-------|--------|
| **Doc ID** | `V10_CANONICAL_CMS` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisites** | PL01–PL04 PASS (`V10_CANONICAL_PUBLICATION_PASS`) |
| **DB deletion** | **NONE** (PL01–PL09 rule) |
| **Verdict** | **`V10_CANONICAL_CMS_PASS`** |

---

## Ownership (unchanged; made explicit)

| Owner | Owns |
|-------|------|
| **Platform** | Draft persistence (`contentService`), versions/restore (via PL04 orchestrator), media folder HTTP helpers, `cmsOrderedListDraft`, batch draft key save, generic validation primitives, publication integration |
| **BlessBoard** | Church content catalogue, structured church content semantics, BB templates/governance, classic CMS UX routes |
| **ActiveClinic** | Clinic catalogue, SECTION/BLOCK semantics, AC templates/workflow |

No universal product content schema was invented. BB `websiteStructuredDraftService` / content-admin entity routes and AC `clinicWebsiteCms` SECTION/BLOCK catalogues remain product-local.

---

## Changes

| Change | Detail |
|--------|--------|
| AC CMS adapter thinned | Removed zero-consumer re-exports of `reorderByIds` / `removeById` / `upsertById`. `clinicWebsiteCmsService` already imports `cmsOrderedListDraft` from platform directly. |
| Adapter docs | BB/AC CMS + editor adapters document platform mechanisms as **authoritative**; product adapters remain product boundaries only. |
| Characterization | `tests/v10-pl05-canonical-cms.test.js` + PC11 expect platform-direct ordered-list; assert no universal schema merge. |
| Editor write path | Engine-primary field saves retained; **classic overlay dual-write kept** (see below). |

---

## Dual-write decision (not removed in PL05)

Attempted removal of BB editor → classic overlay dual-write broke V2.03 shared-editor **live public** text parity (`v7-shared-website-editor` HTTP matrix). Restored immediately.

| Residual | Class | Why kept | Retire |
|----------|-------|----------|--------|
| Editor overlay dual-write (`saveInlineFieldDraft` after engine save) | ACTIVE_LEGACY | Public live still reads classic projection | **PL06** after public is fully engine-sourced |
| `syncDraftToEngine` on classic inline/structured drafts | ACTIVE_LEGACY | Classic CMS paths still project to engine | **PL06** |
| `publishFromLegacy` inside BB publish impl | ACTIVE_LEGACY (impl) | Engine projection on publish | **PL06** (behind PL04 orchestrator) |

Data is disposable, but **canonical fresh-schema public path does not yet fully replace classic live reads** for current V2.03 — removing dual-write is therefore unsafe in PL05.

---

## Preserved

- BB church catalogue / structured editors / HQ–branch content admin
- AC SECTION/BLOCK CMS + library placements + settings chrome
- Tenant isolation (cross-tenant draft writes blocked)
- Publish / version / restore via PL04 `publicationOrchestrator` (not re-opened here)
- RBAC grants unchanged

---

## Tests

| Suite | Result |
|-------|--------|
| `npm run test:architecture` | **PASS** (7/7) |
| `v10-pl05-canonical-cms` + `v10-pc11-cms-convergence` + `v10-pc07-shared-website-editor-http` + `v7-shared-website-editor` + `blessboard-content-admin` + `activeclinic-website-cms` + PC10B BB/AC + `v8-tenant-product-isolation` | **PASS** (68/68) |
| AC CMS / public / editor baseline (`activeclinic-website-cms` batch) | **PASS** (24/24) |
| Publish baselines + BB publish | Covered in 68/68 + prior PL04; draft-live **publish/version/restore** subtest **PASS** |
| `v7-website-draft-live-integrity` | Publish/restore **PASS**; 2 fails = **PRE_EXISTING** path-public **301** + CDN demo image (**PC23 F2/F3**) — not PL05 CMS regressions |

---

## Required marker

```text
V10_CANONICAL_CMS_PASS

Canonical: platform CMS mechanisms (draft/folders/ordered-list/batch/media helpers) authoritative;
           BB/AC retain product catalogues and adapters as product boundaries
Removed: AC adapter ordered-list re-exports (zero-consumer after platform-direct import)
Remaining: classic↔engine dual-write + overlay compatibility → PL06
```
