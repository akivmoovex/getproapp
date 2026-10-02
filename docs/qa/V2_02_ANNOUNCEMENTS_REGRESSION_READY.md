# V2_02_ANNOUNCEMENTS_REGRESSION_READY

Status: **READY** (pre-fix red positive)

Date: 2026-09-28  
Authority: `docs/qa/V2_02_QA_DEFECT_AUDIT.md` (announcement file/document upload → save/publish)  
Constraint: **TEST CHANGES ONLY** — no application code, env defaults, migrations, or production configuration changes.

## TEST_FILES

- `tests/v2-02-announcements-document-upload-regression.test.js` (**new**)
- `docs/qa/V2_02_ANNOUNCEMENTS_REGRESSION_READY.md` (this report)

## NEW_TESTS

| Test | Intent | Pre-fix result |
|------|--------|-----------------|
| `POSITIVE: announcements manager uploads PDF via UI path, saves, reloads, publishes` | Full HTTP workflow: open `/hq/announcements/new` → multipart PDF to `/hq/content/media/upload` (UI path) → assert private asset → create with `media_asset_id` → reload → publish → verify. Actor has `announcements.manage` / `.publish` and **does not** have `website.edit`. Uploads kill-switch **on** (testing deployment model). | **FAIL** (403 at upload) |
| `NEGATIVE: unauthorized user cannot upload via announcement media path` | Session without announcements/website grants → upload denied (401/403). | **PASS** |
| `NEGATIVE: kill-switch rejects content media upload when disabled` | `BLESSBOARD_MEDIA_UPLOADS_ENABLED=0` → 403 `media_uploads_disabled`. | **PASS** |
| `NEGATIVE: cross-tenant private asset cannot be attached on create` | Foreign church private `media_asset_id` rejected on create. | **PASS** |
| `NEGATIVE: non-private asset is rejected for announcement attachment` | Same-tenant public asset rejected where private attachment is required. | **PASS** |

Fixture notes:

- Uses `communications_officer` then strips catalogue `website.*` permissions so the suite does **not** grant `website.edit` solely to pass upload.
- Does **not** insert the positive-path media asset via repository; upload is HTTP multipart only.
- Positive suite forces uploads **enabled** so the failure is not hidden behind the default-off kill-switch (kill-switch covered separately).

## POSITIVE_WORKFLOW_RESULT

**FAIL** (expected before product fix).

- Open create form: **200**
- `POST /hq/content/media/upload` (private PDF, CSRF, announcements manager): **403**
- Subsequent save/reload/publish steps not reached

## FAILURE_BOUNDARY

Matches audit defect #1:

- Announcement UI borrows content-admin upload: `POST /hq/content/media/upload`
- Route gated by **`website.edit`** (`gateContent` / `requireWebsiteEdit`) even when `BLESSBOARD_MEDIA_UPLOADS_ENABLED=1`
- Announcements manager with `announcements.*` but without `website.edit` cannot complete document attach via the real UI path

## NEGATIVE_TEST_RESULTS

| Test | Result |
|------|--------|
| unauthorized upload | **PASS** |
| kill-switch disabled | **PASS** (`403` / `media_uploads_disabled`) |
| cross-tenant attach | **PASS** |
| non-private attach | **PASS** |

## EXISTING_TEST_RESULTS

Command:

```bash
node --test --test-concurrency=1 \
  tests/blessboard-kill-switches.test.js \
  tests/blessboard-announcements.test.js
```

| Suite | Result | Notes |
|-------|--------|-------|
| `tests/blessboard-kill-switches.test.js` | **PASS** (5/5) | Media uploads default-off + service refuse; jobs kill-switch |
| `tests/blessboard-announcements.test.js` | **17/18 pass, 1 fail** | Pre-existing drift in `evaluates platform publish policy without silent publish` (`reason` expected `platform_publish_denied`, got `role`). Unrelated to announcement document-upload HTTP path; not introduced by this regression file. Remaining announcement CRUD/attach/download/GUI cases **PASS**. |

## Flags

```
APPLICATION_CODE_CHANGED=NO
QA_FAILURE_REPRODUCED=YES
READY_FOR_FIX=YES
```
