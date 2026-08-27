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
