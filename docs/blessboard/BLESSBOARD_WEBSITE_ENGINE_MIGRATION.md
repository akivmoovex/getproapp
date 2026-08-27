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
