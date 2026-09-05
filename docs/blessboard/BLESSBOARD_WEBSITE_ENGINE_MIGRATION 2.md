# BlessBoard website engine migration

**Environment:** testing only (`moovex-platform-v7`)  
**Production touched:** NO  
**Content policy:** existing church/branch pages, drafts, and versions are preserved.

## Before

| Concern | BlessBoard (legacy CMS) |
|---------|-------------------------|
| Source of truth | `blessboard.public_pages`, `page_sections`, entity tables |
| Drafts | Overlay tables (`website_inline_field_drafts`, `website_structured_drafts`) plus classic CMS row edits |
| Publish | `churchWebsitePublishService` flips `church_settings.website_status` and page status |
| Versions | `blessboard.website_publication_versions` |
| Engine adapter | `platform.website_instances.adapter_mode = legacy_cms` (shell instance, no content) |
| Hub | HQ preview/publish workflow (`/hq/website`) |
| Permissions | BlessBoard roles + `website.*` keys |

ActiveClinic already used `src/platform/website/` (`shared_engine`).

## After

| Concern | Mapping |
|---------|---------|
| Public church HTML | Still rendered from `public_pages` + entities (product store) |
| Draft / publish / version lifecycle | Shared engine (`src/platform/website-engine/` → `src/platform/website/`) |
| Snapshot key | `cms.snapshot` on `platform.website_content` |
| Adapter | `adapter_mode = shared_engine` (runtime upgrade of existing instances) |
| HQ publish | Product publish **then** `blessboardBridge.publishFromLegacy` |
| Restore as new draft | Product restore **then** `restoreDraftFromLegacy` (engine published unchanged) |
| Unpublish | Product `website_status=draft` **and** `publicationService.unpublishWebsite` |
| Hub actions | Same interaction model as ActiveClinic: Edit, Preview, Publish, Unpublish, Settings, Content Library, Version History |
| Visual identity | BlessBoard HQ/branch chrome — not ActiveClinic medical branding |

## Ownership (unchanged)

- 1 HQ + 1 branch → one church-wide website (`branch_id` null; branch URLs collapse).
- Multiple branches → HQ website + per-branch mini-sites (`scope_ref = branch_id`).

## Data migration

No destructive SQL rewrite. Idempotent runtime backfill:

1. `ensureBlessBoardWebsiteInstance` upgrades `legacy_cms` → `shared_engine`.
2. `ensureEngineContent` / `publishFromLegacy` copies the current publication snapshot into `cms.snapshot`.
3. `blessboard.public_pages` and `website_publication_versions` are **not** deleted.

If a church has never opened HQ Website or published after this change, the engine row may still be empty until the next hub load or publish.

Testing inventory (read-only, `identity_key=moovex-platform-v7`, `environment_code=testing`, 2026-08-27):

```
CHURCH_WEBSITES = 14   (blessboard.public_pages home, branch_id IS NULL)
BRANCH_WEBSITES = 6    (blessboard.public_pages home, branch_id IS NOT NULL)
DRAFT_VERSIONS = 3     (blessboard.website_publication_versions status=draft)
PUBLISHED_VERSIONS = 16 (blessboard.website_publication_versions status=published)
ENGINE_CHURCH_WIDE_INSTANCES = 10
ENGINE_BRANCH_INSTANCES = 0
ENGINE_BLESSBOARD_VERSIONS = 0  (runtime backfill on next hub load / publish)
ACTIVECLINIC_INSTANCES = 9
```

No content rows were deleted. Engine snapshots fill in on hub load or publish.

## Classification of remaining product-specific pieces

| Item | Tag |
|------|-----|
| Church page types and entity CMS | PRODUCT_SPECIFIC |
| HQ/branch multi-site rules | PRODUCT_SPECIFIC |
| Change-submission / review workflow | PRODUCT_SPECIFIC |
| Overlay drafts on `public_pages` | PRODUCT_SPECIFIC store, SHOULD_BE_SHARED lifecycle (now dual-written) |
| Classic CMS forms that can still edit published rows | LEGACY (public overlay drafts remain the isolated path) |
| Shared publish/version/unpublish | SHOULD_BE_SHARED (done) |

## Phase 2 — final migration state

### Public source of truth

`DERIVED_PUBLIC_PROJECTION`. `blessboard.public_pages` and
`blessboard.page_sections` still render the public church site, but they are only
written by the shared publish path and by provisioning/seeding tools. No editor
form can write them directly.

### Direct public mutation paths

| Route / handler | Writes draft? | Writes published? | Shared engine? | Classification |
|---|---|---|---|---|
| `POST /{hq,branch}/content/pages/:pageKey` (title/status) | via engine draft | status transition only | yes (orchestrated publish) | SAFE |
| `POST /{hq,branch}/content/pages/:pageKey/sections` | yes | no (refused: `published_requires_draft`) | yes | SAFE |
| `POST /{hq,branch}/content/pages/:pageKey/sections/:sectionKey` | yes (`saveInlineFieldDraft`) | no | yes | SAFE |
| `POST /{hq,branch}/content/api/inline-field` | yes | no | yes | SAFE |
| `POST /{hq,branch}/content/api/structured-draft` | yes | no | yes | SAFE |
| `POST /{hq,branch}/content/draft-changes/publish` | n/a | yes, via publish | yes | SAFE |
| `POST /hq/website/publish`, `/hq/website/branches/:branchKey/publish` | n/a | yes, via publish | yes (`publishProductWebsite`) | SAFE |
| `POST /hq/website/unpublish` | n/a | availability flag via engine | yes (`unpublishProductWebsite`) | SAFE |
| `POST /{hq,branch}/content/{leadership,ministries,events,sermons,giving,contact}` entity forms | entity rows | entity rows | partial | LEGACY_READ_ONLY for page/section content; entity visibility remains product-owned |
| `blessboard.public_pages` writes in `churchWebsitePublishService` | n/a | yes | yes | SAFE — this *is* the projection writer |
| `publicContentRepository` writes from `websiteDraftApplyService` | n/a | yes | yes | SAFE — publish-time apply |
| Seeding: `configureDemoChurch`, `demoMinimumDatasetService`, `testingWebsiteDemoContentService`, `homeServiceTimesService` repair | n/a | yes (`allowPublishedWrite`) | n/a | SAFE — provisioning, not an editor path |
| `testingDataResetRepository` deletes | n/a | yes | n/a | SAFE — testing reset only |

`UNKNOWN = 0`.

### Version-history backfill

`npm run blessboard:website-engine:backfill`

Testing run against `moovex-platform-v7`:

```
WEBSITES_SCANNED = 19
VERSIONS_CREATED = 19
ALREADY_CURRENT = 0
ERRORS = 0
```

Re-run confirmed idempotency (`VERSIONS_CREATED = 0`, `ALREADY_CURRENT = 19`).
Public content fingerprints for `public_pages`, `page_sections` and
`church_settings.website_status` were identical before and after, and
`blessboard.website_publication_versions` stayed at 38 rows.

### Remaining legacy components

| Component | Status |
|---|---|
| `blessboard.public_pages`, `blessboard.page_sections` | DERIVED — public render compatibility |
| `blessboard.website_publication_versions` | READ-ONLY HISTORY — legacy publication history, retained |
| `blessboard.website_inline_field_drafts`, `website_structured_drafts` | REQUIRED — product draft representation, synced into the engine draft |
| `publicContentAdminService.updatePublicPage` / `updatePageSection` published-write path | DEPRECATED — reachable only with `allowPublishedWrite` (provisioning/seeding) |
| Classic section form media / layout / ordering fields on a live section | DEPRECATED — refused with guidance to the website editor, which has draft representations |
