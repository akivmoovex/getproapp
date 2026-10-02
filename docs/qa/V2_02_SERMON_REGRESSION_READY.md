# V2_02_SERMON_REGRESSION_READY

Status: **READY**

Date: 2026-09-28  
Authority: `docs/qa/V2_02_QA_DEFECT_AUDIT.md` (issue #2 — unable to add a new sermon)  
Constraint: **TEST CHANGES ONLY** — announcements code untouched.

## UI_CONTRACT

### Content-admin Add Sermon (`GET/POST /hq/content/sermons`)

| Field | HTML | Required | Notes |
|-------|------|----------|-------|
| `title` | `type="text"` | **required** | |
| `speaker_name` | `type="text"` | **required** | |
| `summary` | textarea | optional | |
| `preached_at` | **`type="text"`** labeled “ISO datetime” | **required** | placeholder `2026-07-18T10:00:00Z` — **not** `datetime-local` |
| `image_url` | shared media-field | optional | thumbnail |
| `media_url` | `type="url"` | optional | label HTTPS |
| `resource_url` | `type="text"` + media upload | optional | HTTPS or uploaded path |

**PREACHED_AT_INPUT_TYPE:** `text` (content-admin)  
**PREACHED_AT_BROWSER_VALUE:** free text as typed (no browser date normalization)  
**PREACHED_AT_PRODUCT_CONTRACT:** **REQUIRED** (`blessboard.sermons.preached_at TIMESTAMPTZ NOT NULL`; service rejects omitted/`null` with `reason: preached_at`; empty string currently slips past service and fails in PG)

### Structured editor Add Sermon (`POST …/content/api/structured-draft`)

| Field | HTML (JS builder) | Required attr | Browser value when filled |
|-------|-------------------|---------------|---------------------------|
| `title` | text | no | string |
| `speakerName` | text | no | string |
| `date` → `preachedAt` | **`type="date"`** | **no** | **`YYYY-MM-DD`** |
| `mediaUrl` | `type="url"` | no | URL or empty |
| thumbnail `imageUrl` | media upload/library | no | https / media path / empty |

## URL_CONTRACT

| FIELD | REQUIRED/OPTIONAL | CURRENT VALIDATION | CURRENT UI INPUT | EXPECTED BEHAVIOR |
|-------|-------------------|--------------------|------------------|-------------------|
| `media_url` / `mediaUrl` | OPTIONAL | empty→null; https or `/_bb/media/:uuid`; **http rejected** (`*_https_required`) | content-admin `type=url`; structured `type=url` (YouTube/Vimeo prefer + https fallback) | empty OK; http reject; https OK |
| `resource_url` | OPTIONAL | same https/media-path rules | text + document upload | empty OK; http reject |
| `image_url` / thumbnail | OPTIONAL | content-admin create **does not run** `imageUrl` through `buildSermonFields` (dropped on classic create); structured uses `validateImageUrl` (https / media paths) | media-field / structured image controls | empty OK; http reject on structured |

Do **not** weaken https rules for QA convenience.

## Proven mismatch (not audit assumption alone)

1. Content-admin asks for “ISO datetime” via free text; service **does not** parse/validate timestamps — it forwards the string to Postgres.
2. Many non-ISO values succeed (`2026-07-18`, `2026-07-18T10:00`, `July 18, 2026`, US `07/18/2026`).
3. Locale **DMY** `18/07/2026` → PG `date/time field value out of range` → service `lookup_error` → HTTP **503** (not field-level 400).
4. Structured `type=date` `YYYY-MM-DD` **draft save succeeds**.
5. Structured **empty date** also draft-saves **200** with `preachedAt: ""` (gap vs NOT NULL / required contract) — publish/apply would then fail at DB.

## QA_FAILURE_REPRODUCED

```
QA_FAILURE_REPRODUCED=YES
HTTP_STATUS=503
EXACT_FAILURE=Postgres timestamp reject for locale DMY "18/07/2026" (mapped as lookup_error)
FAILURE_LAYER=service-passthrough → database (not early validation)
```

Secondary gap (structured empty date): HTTP **200** draft save when preached date blank — validation layer gap (should be 400).

## Test matrix results

| Case | Result |
|------|--------|
| CANONICAL_ISO_BASELINE | **PASS** |
| INVALID_DATE_TEST | **PASS** (400/503, not 500) |
| EMPTY_OPTIONAL_URL_TEST | **PASS** |
| INVALID_URL_TEST | **PASS** (http + malformed → 400) |
| PERSISTENCE_BASELINE | **PASS** |
| A realistic DMY (assert not 503) | **FAIL** (got 503) — pre-fix red |
| A3 empty structured date (assert 400) | **FAIL** (got 200) — pre-fix red |
| A2 structured YYYY-MM-DD draft | **PASS** |

```
NEW_TESTS: 9/11 pass (2 intentional pre-fix red)
EXISTING_SERMON_TESTS: 19/19
PRE_EXISTING_FAILURES: none in content-admin / sermon-image suites
NEW_UNRELATED_FAILURES: none
```

## FILES

```
TEST_FILES_CHANGED:
- tests/v2-02-sermon-creation-regression.test.js (new)
- docs/qa/V2_02_SERMON_REGRESSION_READY.md (this report)

APPLICATION_CODE_CHANGED=NO
```

## Flags

```
ROOT_CAUSE_CONFIRMED=YES
STITCH_REQUIRED=NO
READY_FOR_FIX=YES
```

## Smallest fix recommendation (DO NOT IMPLEMENT HERE)

1. **UI (preferred):** Change content-admin `preached_at` to `type="date"` or `datetime-local` (match structured editor) so the browser emits unambiguous values; keep label honest.
2. **Service:** Parse/normalize `preachedAt` before insert; on failure return **`INVALID_INPUT` / 400** with `reason: preached_at` — never leak PG errors as 503.
3. **Structured validation:** Reject empty `date`/`preachedAt` with 400 (align with NOT NULL / required contract). Do **not** default-to-now unless product explicitly decides OPTIONAL/DEFAULTABLE (current contract = **REQUIRED**).
4. Preserve https/media-path URL rules; empty optional URLs already OK.
5. No Stitch screen; no announcements changes; no https weakening.
