# V2.01 RC Media Placement Fix QA

**Task:** `V2_01_RC_MEDIA_PLACEMENT_FIX`  
**Date:** 2026-09-26  
**Branch:** `V8` (tip) + promotion branch `v2-01-rc-media-placement`  
**Testing:** `moovex-platform-v8-testing`  
**Production:** **DO NOT TOUCH** — remained `03a89106e2fe` / `moovex-platform-production`

**Refs:**  
- `docs/qa/V2_01_P1_RELEASE_GATE_SUMMARY.md`  
- `docs/qa/V2_01_SHARED_IMAGE_PLACEMENT_QA.md`  
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`  
- `docs/qa/V2_01_PROD_MEDIA_PERSISTENCE_QA.md` (RC-MEDIA-PLACE FAIL on prod)

---

## Verdict

### **`RC_MEDIA_PLACE_FIXED`**

Image placement already ships on current V8 testing tip. A **minimum promotion branch** was cut from prod RC `03a89106e2fe` with only the placement stack (no theme/editor polish). Hosted BB+AC smoke on testing tip **22/0 PASS**. Production untouched.

**Safe for RC promotion:** **YES** — promote branch `v2-01-rc-media-placement` (`b0df05cd`) or the equivalent commit set below. Do **not** promote full V8 tip if the goal is placement-only.

---

## 1. Root cause

| Layer | Prod RC `03a89106e2fe` | V8 testing (placement) |
| --- | --- | --- |
| `src/platform/website/imagePlacement.js` | **Absent** | Present |
| IMAGE normalize in `contentTypes.js` | Keeps only `{ mediaId, src, alt }` | Validates + persists `placement` |
| BB inline draft coerce | `String(value)` risk on objects (`6656d7e2` missing) | Objects preserved |
| Public/edit CSS framing | No `--gp-img-*` / `--placed` | CSS-only crop/zoom |
| Adjust Picture UI | Absent | Present in `website-inline-edit.js` |

Production media upload→publish still worked; **placement JSON was stripped** because the RC had no placement validator/persistence path.

---

## 2. Minimum commits / files (promotion package)

### Commit chain (on `origin/v2-01-rc-media-placement`)

| Order | Commit | Role |
| --- | --- | --- |
| 1 | `a387227e` ← cherry-pick `6656d7e2` | Preserve IMAGE objects on BB inline draft boundary |
| 2 | `2a778b30` ← cherry-pick `c2b86265` (conflict-resolved) | Placement schema + draft/preview/publish/render |
| 3 | `8cd4976c` | Adjust Picture UI + 390 CSS (file checkout; no change-manager/theme pulls) |
| 4 | `b0df05cd` | Cache-bump test assertion → `v2-img-editor-2` |

Upstream originals already on V8 tip: `6656d7e2`, `c2b86265`, `aa4a35c1`, `0675143a` (plus later unrelated editor work).

### Files required (placement only)

| File | Purpose |
| --- | --- |
| `src/platform/website/imagePlacement.js` | Schema / validate / CSS helper |
| `src/platform/website/contentTypes.js` | Persist validated `placement` |
| `src/platform/website/contentService.js` | Pass content key into IMAGE validation |
| `src/platform/website/editableFieldSchema.js` | Object-preserving submitted values + key |
| `src/platform/website/branding.js` | Carry placement through brand helpers |
| `src/platform/media/cdnMediaPresentation.js` | Preserve placement on present |
| `src/platform/website/mediaService.js` | Hydrate preserves placement |
| `src/blessboard/http/contentAdminRoutes.js` | Stop `String()` on IMAGE drafts |
| `src/blessboard/services/websiteInlineDraftService.js` | Object draft path |
| `src/blessboard/http/attachWebsiteAdminChrome.js` | Wire placement into public model |
| `views/blessboard/v5/partials/editable-image.ejs` | CSS vars + data attrs |
| `views/activeclinic/partials/website-editable-image.ejs` | AC parity |
| `views/activeclinic/partials/ac-media.ejs` | styleOverride |
| `views/blessboard/v5/public/home.ejs` + `shell-brand.ejs` | Pass locals |
| `views/activeclinic/tenant/home.ejs` | Hero placement |
| `public/platform/website-inline-edit.css` | Placed + framing UI styles |
| `public/platform/website-inline-edit.js` | Adjust Picture UI |
| Shell / AC / management asset bumps | `v2-img-editor-2` only |
| `tests/v2-01-shared-image-placement.test.js` | Contract + persistence |
| `tests/v2-01-shared-image-payload-contract.test.js` | Object payload |
| `tests/v2-01-universal-image-editor.test.js` | UI serialization |

**Not included:** theme gallery, websites switcher, SP-T*/U1 editor chrome, change-manager CSS, overnight polish.

**Migrations:** none. **CDN:** no asset rewrite (CSS framing only).

---

## 3. Local tests (promotion branch)

```text
node --test \
  tests/v2-01-shared-image-placement.test.js \
  tests/v2-01-shared-image-payload-contract.test.js \
  tests/v2-01-universal-image-editor.test.js
```

**Result:** **22/22 PASS**

---

## 4. Hosted QA (V8 testing tip — already contains placement)

| Surface | Value |
| --- | --- |
| Hosted SHA | `46942296ea49` · `moovex-platform-v8-testing` |
| BB | `bb-v8qa-mub23a6v6a6b` / `/c/…/hq` |
| AC | `ac-v8-qa-mub23a6v6a6b` |
| Production `/healthz` | `03a89106e2fe` · **unchanged** |
| Evidence | `/tmp/v2_01_rc_media_placement_fix_qa.json` |

| Check | BB | AC |
| --- | --- | --- |
| Login + edit mode | **PASS** | **PASS** |
| Upload/select image | **PASS** | **PASS** |
| Save draft with D/M placement | **PASS** | **PASS** |
| Invalid zoom rejected | **PASS** | **PASS** |
| Refresh persists framing | **PASS** | **PASS** |
| Preview (draft mode) | **PASS** | **PASS** |
| Publish | **PASS** | **PASS** |
| Public reload placed CSS | **PASS** | **PASS** |
| CDN URL unchanged | **PASS** | **PASS** |

**Hosted matrix:** **22 PASS / 0 FAIL / 0 BLOCKED**

---

## 5. RC promotion guidance

| Option | Safe? | Notes |
| --- | --- | --- |
| Promote **`v2-01-rc-media-placement`** (`b0df05cd`) | **YES** (placement-only) | Smallest stack onto `03a89106e2fe` |
| Promote full current `V8` tip | **NO** (for this task’s scope) | Pulls unrelated SP-T*/theme/UI work |
| Leave prod at `03a89106e2fe` | Placement stays **FAIL** | Matches gate blocker RC-MEDIA-PLACE |

After promote: re-run `V2_01_PROD_MEDIA_PERSISTENCE_QA` placement checks on disposable prod tenants.

---

## 6. Explicit non-actions

| Action | Status |
| --- | --- |
| Production deploy / host / DB / media root | **Not performed** |
| Theme gallery / websites 503 fixes | Out of scope |
| Unrelated editor/UI merges into promotion branch | Excluded |

---

## Return token

```
RC_MEDIA_PLACE_FIXED
hosted_sha=46942296ea49
promotion_branch=v2-01-rc-media-placement
promotion_tip=b0df05cd
prod_untouched=03a89106e2fe
safe_for_rc_promotion=yes_placement_only_branch
local_tests=22/22
hosted_smoke=22/0/0
```
