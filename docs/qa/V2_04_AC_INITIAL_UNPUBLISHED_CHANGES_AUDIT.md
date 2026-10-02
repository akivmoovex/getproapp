# V2.04 ActiveClinic Initial Unpublished Changes Audit

**Mode:** Diagnosed + FIXED (2026-10-02) — starter seed aligns published baseline without go-live.  
**Date:** 2026-10-01 (diagnosis) / 2026-10-02 (fix)  
**Defect:** Brand-new ActiveClinic registration shows **63 unpublished changes** with zero user edits.  
**Related:** Website Change Manager (`V2_01`), shared `provisionWebsiteInstance` / `seedWebsiteContent`.

### FIX APPLIED (2026-10-02)
- Platform `shouldAlignPublishedBaseline` defaults **true** so starter seed writes matching `draft_value` + `published_value` without flipping instance status to live.
- BB `seedUnpublishedEngineContent` aligns baseline the same way (opt-out via `alignPublishedBaseline: false`).
- Safe repair: `repairProvisionalPublishedBaseline` (dry-run default; `confirm: true` to apply). No production mass-update.
- Focused tests: `tests/v2-04-initial-website-unpublished-count.test.js`.

---

## ROOT_CAUSE

ActiveClinic provisions the clinic website with instance status **`coming_soon`**. Shared provisioner sets `publishStarter` only when status is `"published"` (or an explicit flag). Seed therefore writes **non-null `draft_value`** for every starter content key and leaves **`published_value = null`**.

The unpublished badge is **not** a save counter. It counts distinct content keys where `draft_value !== published_value` (`websiteChangeManagerService.compareDraftToPublished` → `contentService.diffContentRows`).

Every seeded non-null draft vs null published is classified as **`added`**. For a typical new clinic, that is **exactly 63 keys** — the non-null keys from `buildActiveClinicWebsiteTemplateContent` / starter overrides. The other **20** template keys seed as null/null and do not count.

This is **not** intentional “user-authored unpublished work.” It is bootstrap seed without a published baseline. Product docs/comments describe a cloned tenant-owned draft for a new clinic; Change Manager docs define pending changes as real draft≠published edits — not provisioning residue.

---

## CHANGE_COUNT_SOURCE

| Layer | Path | Behavior |
|-------|------|----------|
| Canonical counter | `src/platform/website/websiteChangeManagerService.js` → `compareDraftToPublished` / `getPendingChangeSummary` | `pendingChangeCount` = distinct content keys with draft ≠ published |
| Diff primitive | `src/platform/website/contentService.js` → `diffContentRows` / `valuesEqual` / `classifyDiffChange` | `JSON.stringify(draft) === JSON.stringify(published)`; null vs non-null → change (`added`) |
| Resolver / Studio | `src/platform/website/resolver.js` | Draft mode: `unpublishedCount: changes.length` |
| Hub / settings UX | `src/platform/website/websiteManagementPresentation.js` | Calls Change Manager; surfaces `unpublishedCount` / `unpublishedChanges` |
| AC hub UI | `views/activeclinic/app/settings-website-content.ejs` | `Yes (N)` when `website.unpublishedChanges` |
| Studio chrome | `src/activeclinic/http/attachActiveClinicWebsiteChrome.js` | Publishes unpublished URLs / count into editor shell |

**Granularity:** one **content key** = one change. Nested properties inside structured values (`cms.pages`, `home.faq`, etc.) do **not** multiply the count. Empty arrays / objects still count as one key when published is null. IDs/timestamps on rows are **not** compared; only unwrapped draft/published values.

---

## INITIAL_DRAFT_STATE

**Created:** yes — full ActiveClinic starter seed.

**Path:**

1. Registration approve/provision → `approveClinicRegistrationService` → `provisionActiveClinicClinic(..., websiteStatus: "coming_soon")`  
   (`src/activeclinic/services/approveClinicRegistrationService.js`)
2. → `provisionActiveClinicWebsite` → `provisionWebsiteInstance` + `contentOverrides` from `starterOverrides` / `buildActiveClinicWebsiteTemplateContent`  
   (`src/activeclinic/website/provisionActiveClinicWebsite.js`)
3. Shared registration path may also call `initializeOrganizationWebsite` with adapter `websiteDefaults` (`status: "coming_soon"`, same overrides)  
   (`src/platform/registration/initializeOrganizationWebsite.js`, `src/activeclinic/registration/activeClinicRegistrationAdapter.js`)

**Seed shape:**

- Template keys: **83** (`activeclinic_clinic` v1).
- Starter content object: **63** keys with non-null values (hero/about/services/doctors/contact/location/nav/cms blobs, booleans, empty arrays, etc.).
- Remaining **20** keys: draft null (no override / null default) — no pending change.

Draft exists for the full template row set; rich clinic copy is present immediately.

---

## INITIAL_PUBLISHED_STATE

| Fact | Value |
|------|--------|
| Instance `status` | `coming_soon` (not publicly live) |
| `publishStarter` | **false** (because status ≠ `published`) |
| `published_value` on seed | **null** for every row when `entry.publish === false` (`seedWebsiteContent`) |
| Initial `platform.website_versions` row | **Not created** by AC provision |
| HCO `website_published` | Separate availability flag; unrelated to content-key diffs |

**Conclusion:** AC creates **draft (+ null published baseline)**, not draft-aligned-to-published, and not “published site + working draft.”

`seedWebsiteContent` insert rule (`contentService.js`):

```text
published_value = entry.publish === false ? null : wrapped(draft)
```

---

## WHY_COUNT_IS_63

**Yes — exact field/key count, recomputed from code.**

Simulation (registration-like overrides, `publishStarter=false`):

| Metric | Count |
|--------|------:|
| Template keys | 83 |
| Rows seeded | 83 |
| Non-null draft vs null published (`added`) | **63** |
| Null draft and null published (no change) | 20 |
| Same seed with `publishStarter=true` | **0** |

The **63** matches `Object.keys(buildActiveClinicWebsiteTemplateContent(...)).length` when all returned values are non-null (typical named clinic + contact/address). Empty arrays (`home.testimonials`, `cms.blocks`, …) and objects with null `src` still count as non-null drafts.

**Not caused by:** nested property explosion, metadata/timestamp noise, wrap/unwrap mismatch, or save-operation counting.

---

## BB_BEHAVIOR

| Step | BlessBoard |
|------|------------|
| Instance create | `ensureBlessBoardWebsiteInstance` → `provisionWebsiteInstance` with **`seedDefaults: false`** (no bulk template starter rows) |
| Content seed | `seedUnpublishedEngineContent` → CMS snapshot + editable field rows with **`publish: false`** |
| Version history | Creates a provisional `website_versions` row with **`changeCount: 0`, `changedKeys: []`** (metadata; badge still uses live draft vs published) |
| Badge semantics | Same shared Change Manager (draft ≠ published) |

BB **avoids** dumping the large template default set into `website_content` at provision. It can still leave `published_value` null for whatever it does seed (same shared seed API), so BB is not a perfect “aligned baseline” model either — but it does **not** produce the AC-scale **63** bootstrap false positives from `starterEntries` + rich template defaults.

BB does **not** treat seed as intentional “user must publish 63 keys”; it records a zero-change provisional version while keeping the site provisional/unpublished for availability.

---

## AC_BEHAVIOR

| Step | ActiveClinic |
|------|--------------|
| Registration | Always `websiteStatus: "coming_soon"` |
| Seed | **All** template keys via `starterEntries` + rich `buildActiveClinicWebsiteTemplateContent` overrides |
| Publish baseline | Only if instance status were `"published"` (it is not) |
| Version init | None on provision |
| Hub / Studio | Correctly report Change Manager count → **63** Day-0 |

Existing published AC clinic with no edits: after a real publish, `published_value` mirrors draft for published keys → **unpublishedCount = 0** until the user edits. The bug is specific to **never-aligned** provisional seed.

---

## SHARED_PLATFORM_GAP

1. **`publishStarter` is coupled to instance `status === "published"`**, conflating “publicly live / available” with “has a content baseline for Change Manager.”
2. Change Manager correctly diffs draft vs published, but **provision never establishes a baseline** for `coming_soon` seeds.
3. AC seeds a large default set with `publish: false` → large Day-0 count; BB mitigates volume via `seedDefaults: false`, not via a shared baseline helper.
4. No shared “provisional baseline” API that sets `published_value = draft_value` **without** flipping lifecycle/availability to live.

**Preferred intended behavior (platform):**

```text
NEWLY PROVISIONED WEBSITE
  → initial website baseline established (published_value aligned to seed draft)
  → working draft identical to baseline
  → unpublishedChanges = 0
  → instance may remain coming_soon / provisional until explicit go-live
```

**Not preferred:** treat Day-0 seed as requiring a first “Publish All” of 63 system keys before the site is considered clean. Architecture already separates instance status / HCO availability from content-key diffs; forcing first-publish-as-edits is UX debt, not a documented product requirement.

---

## RECOMMENDED_FIX

**Scope: PLATFORM** (shared provision/seed), with AC call sites using the new flag.

1. When seeding starter defaults for a new **non-live** instance, align baseline:
   - Set seed entries with **`publish: true` for content rows only** (same draft and published values), **or**
   - Add explicit `alignPublishedBaseline: true` / `publishStarter: true` for `coming_soon` without changing instance status / public availability.
2. Optionally mirror BB: create an initial provisional `website_versions` snapshot with `changeCount: 0`.
3. Do **not** zero the badge in the UI while draft≠published remains — Publish All / Discard would still see 63 real diffs.
4. Keep Change Manager semantics unchanged for true user edits.

**Weaker alternative (not preferred):** special-case Change Manager when “never published / all published null / provisional” → count 0. Hides symptom; complicates first real publish semantics.

---

## MIGRATION_REQUIRED

**NO** schema migration. Behavior/seed-flag change only.

---

## BACKFILL_REQUIRED

**YES** for existing AC instances provisioned this way that never established a real published baseline:

- Candidates: `coming_soon` / provisional (or never published version) where `published_value IS NULL` and `draft_value IS NOT NULL`, and no meaningful post-seed user divergence policy.
- Action: set `published_value = draft_value` for those rows (or republish-aligned seed once).
- Skip / careful-handle tenants who already published once and have legitimate unpublished edits.

---

## TESTS_REQUIRED

1. Fresh AC registration/provision → `compareDraftToPublished.pendingChangeCount === 0`.
2. Hub + Studio badge show No / 0 unpublished.
3. User edits one key → count becomes 1.
4. Instance remains `coming_soon` / not publicly live after baseline align.
5. Characterization: `publishStarter=false` + AC starter overrides → 63 `added` (documents today’s bug).
6. BB registration regression: seed does not inflate badge to template-default scale; provisional version still ok.
7. Discard All / Publish All after one edit still behave correctly against aligned baseline.

---

## Trace summary (registration → badge)

```text
register-clinic approve/provision
  → provisionActiveClinicClinic(websiteStatus: "coming_soon")
  → provisionActiveClinicWebsite
  → provisionWebsiteInstance(status: coming_soon, seedDefaults: true)
  → publishStarter = false
  → starterEntries(..., publish: false)  // 83 keys; 63 non-null drafts
  → seedWebsiteContent → draft=value, published=null
  → (no website_versions baseline)
  → Studio/hub → compareDraftToPublished → pendingChangeCount = 63
```

---

## Evidence index

- `src/platform/website/provisionService.js` — `starterEntries`, `publishStarter` gate  
- `src/platform/website/contentService.js` — `seedWebsiteContent`, `diffContentRows`, `valuesEqual`  
- `src/platform/website/websiteChangeManagerService.js` — distinct-key pending count  
- `src/platform/website/websiteManagementPresentation.js` — hub unpublishedCount  
- `src/platform/website/resolver.js` — draft `unpublishedCount`  
- `src/platform/registration/initializeOrganizationWebsite.js` — shared registration seed  
- `src/activeclinic/website/provisionActiveClinicWebsite.js` — AC provision + overrides  
- `src/activeclinic/website/activeClinicWebsiteTemplateContent.js` — 63 starter keys  
- `src/activeclinic/website/activeClinicWebsiteTemplate.js` — 83 KEYS  
- `src/activeclinic/services/approveClinicRegistrationService.js` — `websiteStatus: "coming_soon"`  
- `src/activeclinic/registration/activeClinicRegistrationAdapter.js` — `websiteDefaults`  
- `src/blessboard/website/blessboardWebsiteAdapter.js` — `seedDefaults: false`  
- `src/blessboard/website/blessboardEngineContentService.js` — unpublished seed + provisional version  
- `docs/qa/V2_01_CHANGE_MANAGER_FOUNDATION_QA.md` — count = draft≠published keys  

---

## Footer

COUNT_63_EXPLAINED=YES
ROOT_CAUSE=AC coming_soon seed writes 63 non-null drafts with published_value null; Change Manager counts each as unpublished
EXPECTED_INITIAL_COUNT=0
FIX_SCOPE=PLATFORM
MIGRATION_REQUIRED=NO
BACKFILL_REQUIRED=YES
FINAL=AC_INITIAL_UNPUBLISHED_CHANGES_DIAGNOSED
