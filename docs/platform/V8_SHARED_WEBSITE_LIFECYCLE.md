# V8 Shared Website Publishing & Media Persistence

**Status:** Active  
**Branch:** `V8`  
**Modules:** `contentService`, `publicationService`, `mediaService`, `hostingerMedia*`, `cdnMediaPresentation`, `v7CompatibleWebsitePublish`

## Goals

1. Shared draft → preview → publish → history → restore lifecycle for BlessBoard and ActiveClinic.
2. Drafts never mutate live published pages until an authorized publish.
3. Optimistic concurrency (`expectedUpdatedAt`) prevents silent overwrite of newer drafts.
4. Hostinger media: V8 writes under `testing-v8/`; V7 keeps `testing/`; V8 may **read** V7 keys; neither may delete the other’s namespace.
5. Soft-archive refuses while draft, published, usage, or version-history snapshots still reference media.
6. CDN presentation recognizes `testing-v8/` keys; V7 media URLs and DB refs stay valid.
7. V8-only section/content shapes are blocked from shared V7 publish snapshots until a compatible adapter exists.

## Draft vs published

| Store | Column | Reader |
|-------|--------|--------|
| Draft | `platform.website_content.draft_value` | Editor / preview (`MODE.DRAFT`) |
| Live | `platform.website_content.published_value` | Public (`MODE.LIVE`) |
| History | `platform.website_versions.snapshot_json` | Immutable; restore-as-draft or live restore |

`publishWebsiteDraft` copies draft → published then creates a new version. `restoreWebsiteVersionToDraft` leaves published unchanged.

## Media isolation

| Runtime | Write | Read | Delete |
|---------|-------|------|--------|
| V7 testing | `testing/` | `testing/` | `testing/` only |
| V8 testing | `testing-v8/` | `testing/` + `testing-v8/` | `testing-v8/` only |
| Production | `production/` | `production/` | `production/` only |

Helpers: `assertStorageKeyWritable`, `assertStorageKeyReadable`.

## V7-compatible publish guard

`src/platform/website/v7CompatibleWebsitePublish.js` scans changed drafts for `v8Format` / `formatVersion > 1` / unknown section types and returns `v8_incompatible_publish` before mutating published values or snapshots.

## Tests

- `tests/v8-shared-website-lifecycle.test.js`
- Existing: `v7-website-draft-live-integrity`, `platform-website-engine`, `v7-hostinger-media-storage`, lifecycle moderation suites

```bash
node --test --test-concurrency=1 tests/v8-shared-website-lifecycle.test.js
npm run test:v8:regression
```
