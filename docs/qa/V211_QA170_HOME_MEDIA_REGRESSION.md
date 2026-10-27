# V211-QA170 Home Section Media Regression

## Contract review

The canonical Home editor uses the shared media picker at `/c/:organizationKey/website/media`, with uploads through `POST /hq/content/media/upload`, an issued V5 session, CSRF protection, and an authorized media reference owned by the tenant. The section save consumes the canonical media reference; arbitrary external URLs are not valid fixtures.

Existing fixture facilities include `createMediaUploadService`, local filesystem storage, `registerWebsiteMedia`, and test-owned media repositories in the unit/integration suites. These facilities provision isolated local test storage and database fixtures; they do not provide an approved way to mutate the existing QA75 hosted tenant without a valid authorized asset and enabled entitlement.

## Execution

The QA156 authorized session evidence remains authoritative for the target hosted tenant:

- Media library GET: HTTP `200`.
- Authorized media library: empty.
- Supported multipart upload: HTTP `403`, controlled `media_uploads_disabled`.
- No test-owned authorized media asset was available for selection.

The upload entitlement was not changed, no media identifier was fabricated, no arbitrary URL was submitted, and no repeated unsupported upload was attempted. Home image selection, image save/reopen, image URL resolution, and public image publication therefore remain unexercised.

Non-destructive contract suite:

```text
node --test tests/v2-shared-media-upload-parity.test.js tests/activeclinic-mw-stitch-parity.test.js tests/v203-qa-automation-gaps.test.js
```

Result: 37 passed, 0 failed, 0 skipped. These tests verify shared picker/upload contracts, CSRF and entitlement policy contracts, media ownership/tenant-denial contracts, and draft/publication service contracts. They do not substitute for the missing authorized hosted media asset.

## Result

- `MEDIA_FIXTURE=MEDIA_FIXTURE_UNAVAILABLE`
- `MEDIA_SELECTED=NOT_EXECUTED`
- `IMAGE_SAVE=NOT_EXECUTED`
- `IMAGE_PERSISTENCE=NOT_EXECUTED`
- `PUBLISH=TEXT_ONLY_PREVIOUSLY_VERIFIED; IMAGE_NOT_EXECUTED`
- `PUBLIC_TEXT=PREVIOUSLY_VERIFIED`
- `PUBLIC_IMAGE=NOT_VERIFIED`
- `BB_08_STATUS=PARTIALLY_VERIFIED`
- `TESTS_PASS=37`
- `TESTS_FAIL=0`
- `TESTS_SKIP=0`
- `CONFIRMED_PRODUCT_DEFECTS=NONE`

Remaining blocker: the QA runtime must expose a test-owned authorized media asset or enable the supported upload entitlement through approved environment configuration. This audit did not modify product code, entitlements, database state, or deployment settings.
