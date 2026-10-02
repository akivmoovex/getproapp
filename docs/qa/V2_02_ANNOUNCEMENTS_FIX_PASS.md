# V2_02_ANNOUNCEMENTS_FIX_PASS

Status: **PASS**

Date: 2026-09-28  
Authority: `docs/qa/V2_02_ANNOUNCEMENTS_REGRESSION_READY.md`  
Reproduction: announcements manager → form 200 → `POST …/content/media/upload` 403 (kill-switch **on**)

## ROOT_CAUSE_CONFIRMED

Announcement UI borrowed generic content-admin upload (`/hq/content/media/upload`), which is gated by **`website.edit`**. Legitimate announcements managers with `announcements.manage` / `.publish` and without `website.edit` could open the form but could not upload private documents.

## AUTHORIZATION_BEFORE

| Surface | Authz |
|---------|-------|
| Announcement admin pages | `announcements.view` (+ service `announcements.manage` / `.publish`) |
| Document upload used by form | **`website.edit`** via content-admin `gateContent` |
| Kill switch | `BLESSBOARD_MEDIA_UPLOADS_ENABLED` on content upload |

## AUTHORIZATION_AFTER

| Surface | Authz |
|---------|-------|
| Announcement admin pages | unchanged (`announcements.view` + service manage/publish) |
| Announcement attachment upload | **`announcements.manage`** on purpose-scoped `POST …/announcements/…/media/upload` |
| Generic content upload | **unchanged** — still `website.edit` via `gateContent` |
| Kill switch | enforced on both mounts via shared `requireMediaUploadsEnabled` |
| Visibility | announcement upload **forces `private`** |

## IMPLEMENTATION

Shared media HTTP glue + purpose-scoped announcement mount; content-admin upload refactored to the same glue without weakening its authz.

### FILES_CHANGED

| Class | Path |
|-------|------|
| APPLICATION | `src/blessboard/http/blessBoardMediaUploadHttp.js` (**new**) |
| APPLICATION | `src/blessboard/http/announcementAdminRoutes.js` |
| APPLICATION | `src/blessboard/http/contentAdminRoutes.js` |
| TEST | `tests/v2-02-announcements-document-upload-regression.test.js` |
| TEST | `tests/blessboard-v5-route-link-audit.test.js` |
| DOC | `docs/qa/V2_02_ANNOUNCEMENTS_FIX_PASS.md` (this file) |

No migrations. No production config. No Stitch. No `website.edit` grants.

## POSITIVE_WORKFLOW

| Step | Result |
|------|--------|
| UPLOAD | **PASS** — `POST /hq/announcements/media/upload` 200 |
| PRIVATE_ASSET | **PASS** — `visibility: private` |
| ATTACH | **PASS** — `media_asset_id` on create |
| SAVE | **PASS** — create 303 |
| RELOAD | **PASS** — edit shows attachment |
| PUBLISH | **PASS** — publish 303; detail published + attachment |

## SECURITY

| Check | Result |
|-------|--------|
| UNAUTHORIZED_UPLOAD | **PASS** |
| KILL_SWITCH | **PASS** (`media_uploads_disabled`) |
| CROSS_TENANT | **PASS** |
| NON_PRIVATE | **PASS** |
| TENANT_ISOLATION | **PASS** (media suite + regression cross-tenant) |
| RBAC | **PASS** (`blessboard-authorization`, `v2-02-bb-catalogue-only-rbac`, route audit) |

## TEST RESULTS

```
NEW_REGRESSION_TESTS: 5/5
ANNOUNCEMENTS_TESTS: 17/18
KILL_SWITCH_TESTS: 5/5
OTHER_RELEVANT_TESTS: media 17/17; authorization+catalogue RBAC+route-audit 47/47
```

## PRE_EXISTING_FAILURES

- `tests/blessboard-announcements.test.js` → `evaluates platform publish policy without silent publish`  
  Expected reason `platform_publish_denied`, actual `role`.  
  **Unchanged by this fix.** Not modified.

## NEW_FAILURES

None attributed to this change.

## Flags

```
WEBSITE_EDIT_GRANTED=NO
KILL_SWITCH_BYPASSED=NO
SECURITY_WEAKENED=NO
NEW_STITCH_SCREENS=0
MIGRATION=NO
PRODUCTION=UNTOUCHED
```

## FINAL

```
ANNOUNCEMENTS_READY_FOR_MANUAL_RETEST=YES
```
