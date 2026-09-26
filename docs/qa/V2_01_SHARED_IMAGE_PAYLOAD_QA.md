# V2.01 Shared Image Payload Contract QA

**Task:** `V2_01_SHARED_IMAGE_PAYLOAD_CONTRACT`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Prior A1 tip:** `bb2f1d0a0170`  
**B1 commit / hosted SHA:** `6656d7e233f0` (`6656d7e233f0235dffb1609f32ea17a700a905f4`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `databaseIdentityExpected=moovex-platform-v7` · `databaseIdentityEnv=testing`  
**Production:** **untouched**

**Refs:** `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`, `docs/qa/V2_01_BB_INLINE_EDITOR_PARITY_QA.md`

**Personas (disposable):**
- BB HQ `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · org `bb-v8qa-mub23a6v6a6b`
- AC admin `clinic.admin@ac-hqa-v8mub23a6v6a6b.example.invalid` · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_SHARED_IMAGE_PAYLOAD_PASS`**

Hosted tip matches B1. BB inline-field now accepts the shared IMAGE object `{ mediaId, src, alt }`, rejects unsafe/foreign media, and publishes owned library images. AC drafts continue to accept the same object contract. Production was not modified.

---

## 1. Root cause

| Item | Detail |
| --- | --- |
| Rejected shape | Client POST `{ contentKey: "home.hero.image", value: { mediaId, src, alt } }` |
| Symptom | `400 validation_failed` / `invalid_url` |
| Working shape | Same endpoint with `value: "<https URL string>"` |
| Rejecting layer | **BB** `POST /hq/content/api/inline-field` (and publish twin) in `contentAdminRoutes.js` |
| Exact bug | `const newValue = body.value != null ? String(body.value) : ""` coerced objects to `"[object Object]"`, which then failed IMAGE/URL validation |
| Not the cause | `contentTypes` IMAGE object validator (already correct); `assertOwnedWebsiteImageValue` (ownership layer) |

Legitimate rejects (still enforced):
- `javascript:` / unsafe schemes → `validation_failed`
- Unknown / cross-tenant `mediaId` → `forbidden` / `media_not_found` / `tenant_mismatch` via shared media ownership

---

## 2. Canonical supported payload contract

Shared WE01 IMAGE draft value (after validation / ownership rewrite):

```json
{
  "mediaId": "<uuid|null>",
  "src": "<https URL or owned delivery path|null>",
  "alt": "<string|null>"
}
```

Also accepted for compatibility:
- String URL / relative path → normalized to `{ src, alt: null, mediaId: null }` (then ownership rules apply when `mediaId`/tenant paths present)

Server-side ownership (`mediaService.assertOwnedWebsiteImageValue`) remains required for tenant media IDs and clinic/`/c/` delivery paths. A URL inside an object is **not** treated as trusted by itself.

---

## 3. Files changed (B1)

| File | Change |
| --- | --- |
| `src/platform/website/editableFieldSchema.js` | `readSubmittedEditableValue`, `editableValuesEqual`, `serializeOverlayDraftValue` |
| `src/blessboard/http/contentAdminRoutes.js` | Inline-field + publish use `readSubmittedEditableValue` (no object `String()`) |
| `src/blessboard/services/websiteInlineDraftService.js` | Object-safe compare/serialize; map ownership/validation engine failures to 400/403 |
| `tests/v2-01-shared-image-payload-contract.test.js` | Contract + route regression tests |

No BB-only media store, no crop/theme/section/HQ-branch work.

---

## 4. Local tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-shared-image-payload-contract.test.js` | **PASS** (6) |
| `tests/v2-01-bb-inline-editor-parity.test.js` | **PASS** (5) |
| `tests/v7-website-image-management.test.js` (cross-tenant / invalid types) | **PASS** |

---

## 5. Deploy

| Step | Result |
| --- | --- |
| Commit | `6656d7e2 Fix shared image draft saves that stringified media objects.` |
| Push `V8` | **PASS** |
| Hosted BB/AC SHA | **PASS** — `6656d7e233f0` on `moovex-platform-v8-testing` |
| Unrelated working tree | Preserved (not committed) |

---

## 6. Hosted QA

### BlessBoard

| Scenario | Result |
| --- | --- |
| Choose existing library image → object payload save | **PASS** (`200 ok`, alt persisted) |
| String URL compatibility | **PASS** |
| Refresh / draft preview without publish | **PASS** (alt + mediaId on draft; no pencils) |
| Live before publish lacks draft alt | **PASS** |
| Publish → public image/alt | **PASS** |
| Reject `javascript:` object src | **PASS** (`400 validation_failed`) |
| Reject unauthorized/foreign mediaId | **PASS** (`403 forbidden`) |
| Unrelated structured social link still live | **PASS** (`QA Social bb2f1d0a` present) |
| Desktop / 390 UI | **PASS** (no UI chrome change; existing editor dialog unchanged) |

### ActiveClinic

| Scenario | Result |
| --- | --- |
| Edit chrome + preview isolation | **PASS** |
| Object payload save (`home.hero.image` / `home.logo` / `about.story.image`) | **PASS** (`saved_to_draft`) |
| Reject unsafe object URL | **PASS** (`400 validation_failed`) |
| Cross-scope: AC session cannot BB-edit | **PASS** |
| Upload-from-computer | **SKIPPED** (library empty on disposable AC; HTTPS object + shared ownership path covered; upload stack unchanged) |

---

## 7. Remaining gaps

- Disposable AC tenant had **0 library assets**, so “choose existing library media” was exercised on BB; AC covered object HTTPS saves + unsafe reject.
- Cropping / focal / desktop-mobile placement remain out of scope (architecture audit backlog B).

---

## 8. Production confirmation

No production host, DB, media root, or deployment profile was modified. All writes used disposable V8 testing tenants only.

---

## Verdict line

`V2_01_SHARED_IMAGE_PAYLOAD_PASS`
