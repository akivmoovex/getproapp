# V2_02_SERMON_FIX_PASS

Status: **PASS**

Date: 2026-09-28  
Authority: `docs/qa/V2_02_SERMON_REGRESSION_READY.md`

## ROOT_CAUSE_CONFIRMED

1. Classic content-admin used free-text “ISO datetime”; service forwarded unvalidated strings to Postgres → locale DMY became **503 lookup_error**.
2. Structured draft treated empty `date`/`preachedAt` as present (`""`) and saved **200**, violating REQUIRED / `NOT NULL`.

## DATE_CONTRACT

| | |
|--|--|
| **UI_INPUT_BEFORE** | content-admin `type="text"` “ISO datetime”; structured `type="date"` (not required) |
| **UI_INPUT_AFTER** | both surfaces `type="date"` + **required**; content-admin value is `YYYY-MM-DD` |
| **SERVER_ACCEPTS** | `YYYY-MM-DD`; ISO-8601 datetimes with `T` (back-compat) |
| **SERVER_REJECTS** | empty/whitespace; slash locale formats (`18/07/2026`); non-ISO human text; impossible calendar dates (`2026-02-31`); malformed |

Canonical helper: `normalizeSermonPreachedAt` in `publicContentAdminService` (used by `buildSermonFields` → classic create + structured validation).

## Defect outcomes

| Case | Before | After |
|------|--------|-------|
| DMY `18/07/2026` | **503** lookup_error | **400** “Enter a valid preached date.” |
| EMPTY_STRUCTURED | **200** draft | **400** controlled validation |
| VALID_YYYY_MM_DD | (works) | **303** / structured **200** |
| CANONICAL_ISO | **PASS** | **PASS** |
| IMPOSSIBLE_DATE | PG/503 path | **400** |
| MALFORMED_DATE | PG/503 path | **400** |

```
URL_CONTRACT_CHANGED=NO
```

## Workflow

| Step | Result |
|------|--------|
| CREATE | PASS |
| SAVE (structured draft) | PASS |
| RELOAD | PASS (edit form shows `YYYY-MM-DD`) |
| PERSISTENCE | PASS |

## FILES_CHANGED

| Class | Path |
|-------|------|
| APPLICATION | `src/blessboard/services/publicContentAdminService.js` |
| APPLICATION | `src/blessboard/services/websiteStructuredDraftValidation.js` |
| APPLICATION | `src/blessboard/http/contentAdminRoutes.js` (error copy for `preached_at`) |
| APPLICATION | `views/blessboard/v5/content-admin/entity-fields.ejs` |
| APPLICATION | `public/blessboard/v5/website-structured-edit.js` |
| TEST | `tests/v2-02-sermon-creation-regression.test.js` |
| TEST | `tests/blessboard-content-admin.test.js` (edit value assert → date-only) |
| DOC | `docs/qa/V2_02_SERMON_FIX_PASS.md` |

```
CONFIG: none
MIGRATION: NO
```

### Follow-up (out of scope)

Classic content-admin create still does not apply `imageUrl` through `buildSermonFields` (pre-existing). Does not block sermon creation.

## TEST RESULTS

```
NEW_REGRESSION_TESTS: 13/13
EXISTING_SERMON_TESTS: 14/14 (blessboard-content-admin)
IMAGE_PERSISTENCE_TESTS: 5/5
OTHER_RELEVANT_TESTS: n/a (smallest set above)
```

```
PRE_EXISTING_FAILURES: none in this set
NEW_FAILURES: none
```

## Flags

```
STITCH_REQUIRED=NO
NEW_STITCH_SCREENS=0
MIGRATION=NO
PRODUCTION=UNTOUCHED
```

## FINAL

```
SERMONS_READY_FOR_MANUAL_RETEST=YES
```
