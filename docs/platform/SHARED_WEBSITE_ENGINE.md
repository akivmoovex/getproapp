# Shared V7 website engine

Canonical module: `src/platform/website-engine/`  
Implementation services: `src/platform/website/`

ActiveClinic and BlessBoard share one editing, draft, preview, publish, unpublish, and version lifecycle. Product page types and ownership stay in configuration.

## Architecture

```
Product HTTP (ActiveClinic CMS / BlessBoard HQ+branch)
        │
        ▼
src/platform/website-engine/     public API, schema registry, permission hooks
        │
        ▼
src/platform/website/            instances, content, versions, publish, preview, audit
        │
        ▼
platform.website_* tables
```

BlessBoard public pages (`blessboard.public_pages`, entities, overlay drafts) remain the **church content store**. The engine owns **lifecycle**: draft vs published isolation, versions, publish, unpublish, restore-as-new-draft, audit.

ActiveClinic CMS structures (`cms.pages`, sections, library) already live as engine content keys.

## Lifecycle

```
EDIT → SAVE DRAFT → PREVIEW DRAFT → PUBLISH → PUBLIC VERSION
```

- `contentService.saveWebsiteDraft` writes `draft_value` only.
- Public visitors resolve `MODE.LIVE` (`published_value`).
- `publicationService.publishWebsiteDraft` copies draft → published and inserts an immutable `platform.website_versions` row.
- Restore copies a historical snapshot into **draft only** (`restoreWebsiteVersionToDraft`). Historical rows are never overwritten.
- `publicationService.unpublishWebsite` takes the site off the public internet (lifecycle → provisional + product availability hook). Published snapshots stay.

## Database model

| Table | Role |
|-------|------|
| `platform.website_instances` | One site per tenant scope (`organization_id` + `product_code` + `scope_ref`) |
| `platform.website_content` | `draft_value` / `published_value` per content key |
| `platform.website_versions` | Immutable published snapshots |
| `platform.website_media` | Shared media library |
| `platform.website_audit_events` | Append-only audit |
| `platform.website_edit_sessions` | Batched editor sessions |

Tenant isolation: every query includes `organization_id`. Instance lookup by id always requires org id.

BlessBoard also keeps product tables (`public_pages`, `website_publication_versions`, overlay drafts) so church entities and HQ/branch governance are not flattened.

## Product schema registry

`src/platform/website-engine/productSchemaRegistry.js`

| Product | Pages | Ownership |
|---------|-------|-----------|
| ActiveClinic | home, about, services, doctors, pricing, contact, location, book | One clinic site |
| BlessBoard | home, about, leadership, ministries, events, sermons, giving, contact | HQ church-wide site; separate branch sites when the church has multiple branches |

The engine does not hard-code medical or church labels in publish/version code.

## Ownership model

- **ActiveClinic:** one website instance per clinic organization (`scope_kind` clinic/tenant).
- **BlessBoard:** `church_wide` instance (`scope_ref` null) for HQ. Branch instances use `scope_kind=branch` and `scope_ref=branch_id` when multi-site rules require it. A church with a single campus continues to use one church-wide website.

## Permission hooks

`src/platform/website-engine/permissionHooks.js`

Shared keys: `website.view`, `website.edit`, `website.publish`, `website.rollback`, `website.restore`, `website.media.upload`, …

Product roles map onto those keys (clinic admin vs church HQ admin vs branch admin vs website editor). Route handlers must call the engine; they must not re-implement publish authorization.

## Versioning

- List: `versionService.listWebsiteVersions`
- Preview: load snapshot without mutating live content
- Restore as new draft: `publicationService.restoreWebsiteVersionToDraft`
- Publish restored draft: `publishWebsiteDraft` (new version number)

## Publish semantics

`publicationService.publishWebsiteDraft`

1. Tenant + instance scope
2. Reject `publishLocked` / `PLATFORM_LOCKED`
3. Review policy requires `forceTenantPublish` (HQ/admin publish)
4. Copy changed draft keys to published
5. Insert version + audit + moderation event

BlessBoard HQ publish also applies overlay drafts to `public_pages`, then dual-writes `cms.snapshot` through `blessboardBridge.publishFromLegacy`. Public church HTML still reads `public_pages` (product store). Shared editor CSS loads on BlessBoard HQ/branch shells only when `loadWebsiteEngineCss` is set or `activeNav` is `website`/`content`.

## Preview semantics

- Draft preview uses `MODE.DRAFT` or product preview routes (`website_mode=draft`, HQ `/hq/content/preview/:pageKey`).
- Version preview overlays a historical snapshot and must be `noindex`.
- Preview never writes published content.

## Unpublish

`publicationService.unpublishWebsite` — tenant-facing take-down. Content and history remain. Product availability flags (`healthcare_organizations.website_published`, `church_settings.website_status`) sync through `lifecycleService`.

## Canonical ownership

Phase 2 makes the shared engine the single owner of publication semantics. The
product layer keeps its schemas, content fields, terminology, templates, and
ownership model, and it owns nothing else in the list below.

| Concern | Owner | Notes |
|---|---|---|
| Drafts | Shared engine (`platform.website_content.draft_value`) | BlessBoard field/structured overlays are product-side draft *representations* that sync into the engine draft via `blessboardBridge.syncDraftToEngine`. |
| Published versions | Shared engine (`platform.website_versions`) | Immutable rows. Never updated in place; a new version is always appended. |
| Publication pointer | Shared engine (`platform.website_content.published_value` + `website_instances.published_at`) | `blessboard.church_settings.website_status` is a product availability flag driven by the publish path, not an independent pointer. |
| Audit | Shared engine (`platform.website_audit_events`, `website_moderation_events`) | Product audit tables remain as additional, read-only product history. |
| Permissions | Shared engine (`permissionHooks.assertWebsiteAction`) | Product adapters add tenant/branch isolation only. |
| Restore | Shared engine (`publicationService.restoreWebsiteVersionToDraft`) | Restore always produces a new draft; it never mutates a version or the live site. |
| Public projection | Shared engine writes it; product renders it | See below. |

### Lifecycle entry point

`lifecycleOrchestrator` is the canonical entry point for publication state
changes:

```
publishProductWebsite / unpublishProductWebsite / restoreProductWebsiteVersion
  -> assertWebsiteAction(grantedPermissions, action)
  -> registered product projection handler (one transaction)
       -> product public projection
       -> engine version + publication pointer + audit
```

Route handlers pass `productCode` plus granted permission keys and never call a
product publish service directly. Products register handlers through
`registerProductLifecycle`, so the engine — not product code — decides whether a
publication is allowed to proceed.

### Public source of truth

Selected model: **DERIVED_PUBLIC_PROJECTION**.

- ActiveClinic renders directly from the engine published snapshot.
- BlessBoard renders public HTML from `blessboard.public_pages` /
  `blessboard.page_sections`, which are now a derived projection: the only
  writers are the shared publish path (`churchWebsitePublishService` +
  `websiteDraftApplyService`, invoked by the orchestrator) and provisioning /
  seeding tools. They are no longer an authoritative editable store.
- Editor forms cannot write a published row. `publicContentAdminService`
  refuses any editor-form write (`enforcePublishConfirm`) that would change a
  published page title or section content, and the classic section form rewrites
  live text edits into engine field drafts.

### Version-history migration

Migration completeness does not depend on an administrator opening the website
hub. Hub load still repairs harmless missing state, but the authoritative pass is
the explicit command:

```
npm run blessboard:website-engine:backfill -- --dry-run
npm run blessboard:website-engine:backfill
```

It is idempotent (skips any site with existing engine history), never writes
`blessboard.*`, never changes `website_status`, preserves legacy publication
history, and stamps `MIGRATION_ORIGIN = website_engine_backfill_v7_phase2`.
