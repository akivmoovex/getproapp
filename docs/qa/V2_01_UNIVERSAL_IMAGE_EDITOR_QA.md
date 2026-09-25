# V2.01 Universal Image Editor UI QA

**Task:** `V2_01_UNIVERSAL_IMAGE_EDITOR_UI`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` (`blessboard.neuniversity.org` / `activeclinic.neuniversity.org`)  
**Baseline (B2 functional):** `c2b862655a6b`  
**Baseline (B2 QA tip):** `053edba2509a`  
**B3 commits:** `aa4a35c1bb29` (Adjust Picture UI) · `0675143aaffa` (390 overflow CSS + AC/BB cache bump + this report)  
**Final hosted SHA:** `0675143aaffa` (`0675143aaffa43a3db24dd111f6beeddcbf9d022`)  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `databaseIdentityExpected=moovex-platform-v7` · `databaseIdentityEnv=testing` · `mediaWriteNamespace=testing-v8`  
**Production:** **untouched** (`blessboard.com` `/healthz` remained `03a89106e2fe` / `moovex-platform-production`)

**Refs:**  
- `docs/qa/V2_01_SHARED_EDITOR_ARCHITECTURE_AUDIT.md`  
- `docs/qa/V2_01_SHARED_IMAGE_PAYLOAD_QA.md`  
- `docs/qa/V2_01_SHARED_IMAGE_PLACEMENT_QA.md`  
- Stitch **Website Change Management System** `projects/12538817760086591589` — Universal Image Editor (desktop + 390)

**Personas (disposable):**  
- BB HQ `hq.admin@bb-v8qa-mub23a6v6a6b.example.invalid` · org `bb-v8qa-mub23a6v6a6b`  
- AC admin `clinic.admin@ac-hqa-v8mub23a6v6a6b.example.invalid` · org `ac-v8-qa-mub23a6v6a6b`

---

## FINAL VERDICT

**`V2_01_UNIVERSAL_IMAGE_EDITOR_PASS`**

One shared Adjust Picture crop-and-position UI ships on existing WE01 inline image dialogs for BB and AC, serializing the B2 placement contract `{ v:1, fit, x, y, zoom, mobile? }`. Hosted browser QA covered desktop and 390px on disposable tenants. No new image engine or website editor. Production untouched.

---

## 1. Shared UI / components reused or added

| Piece | Role |
| --- | --- |
| `public/platform/website-inline-edit.js` | Extended existing image field editor: Upload / Library / Replace / Remove + **Adjust Picture** framing panel (drag, zoom, Fit/Fill, Desktop/Mobile when slot allows, Reset) |
| `public/platform/website-inline-edit.css` | `.gp-website-framing*` styles; 390px overflow containment |
| `views/blessboard/v5/partials/editable-image.ejs` | `data-website-slot-separate` + `data-website-image-placement` for reopen |
| `views/activeclinic/partials/website-editable-image.ejs` | Same attrs (AC parity) |
| Existing media uploader / library picker | Unchanged; 5 MB; JPEG/PNG/WebP/GIF |
| B2 `imagePlacement.js` + WE01 save paths | Authoritative validation; UI only serializes supported fields |

No themes, section creation, or HQ/branch redesign.

---

## 2. Supported image slots and limitations

| Slot | Separate D/M controls | Notes |
| --- | --- | --- |
| `home.hero.image` | Yes | Preview uses rendered container; registry aspects null (no invented 16:9/9:16) |
| `about.story.image` | Yes | Same |
| `home.logo` | No | Mobile mode hidden; responsive hint shown |
| `seo.image` | No | Contract only; not a visual crop canvas |
| Unknown IMAGE keys | Separate allowed | No fabricated aspect |

Original CDN / library file is never cropped — framing is CSS `object-position` + scale via placement metadata only.

---

## 3. Exact files changed (B3)

**Functional UI (`aa4a35c1bb29`):**

- `public/platform/website-inline-edit.js`
- `public/platform/website-inline-edit.css`
- `views/blessboard/v5/partials/editable-image.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-start.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`
- `src/platform/website/renderWebsiteManagementPage.js`
- `tests/v2-01-universal-image-editor.test.js`

**Follow-up (this tip — 390 overflow + AC cache + QA):**

- `public/platform/website-inline-edit.css` (containment / wrap)
- `src/activeclinic/http/renderActiveClinicPublic.js` (`ASSET_VERSION=v2-img-editor-2`)
- BB/management cache → `v2-img-editor-2`
- `tests/v2-01-universal-image-editor.test.js` (cache assertions)
- `docs/qa/V2_01_UNIVERSAL_IMAGE_EDITOR_QA.md`
- `docs/qa/references/v2-01-universal-image-editor/*`

Unrelated untracked prior QA docs preserved (not in this commit).

---

## 4. Automated tests

| Suite | Result |
| --- | --- |
| `tests/v2-01-universal-image-editor.test.js` | **PASS** (6) — picker markers, framing markup, BB/AC partial attrs, placement shape vs server, drag/zoom/reset helpers, cache bumps |
| `tests/v2-01-shared-image-placement.test.js` | **PASS** (10) — B2 contract regression |

---

## 5. Deploy

| Step | Result |
| --- | --- |
| Push `V8` (Hostinger git-linked → `moovex-platform-v8-testing`) | **PASS** — `aa4a35c1bb29` then `0675143aaffa` |
| Hosted SHA before browser QA (functional UI) | **PASS** — BB/AC `aa4a35c1bb29` at interactive framing QA |
| Final hosted tip after CSS/QA commit | **PASS** — BB/AC `0675143aaffa` · `deploymentCode=moovex-platform-v8-testing` |
| Production `/healthz` | **Unchanged** `03a89106e2fe` / `moovex-platform-production` |

---

## 6. Hosted browser QA (disposable)

### BlessBoard (`bb-v8qa-mub23a6v6a6b`)

| Scenario | Result | Evidence |
| --- | --- | --- |
| Edit image → Adjust Picture | **PASS** | Desktop framing panel |
| Drag / zoom / Fit·Fill / Reset present | **PASS** | UI + CDP |
| Desktop + Mobile modes (hero) | **PASS** | Modes visible |
| Zoom persist Save draft → reopen | **PASS** | e.g. zoom `1.45` restored |
| 390px framing usable | **PASS*** | `bb-390-adjust-picture.png` · *wrap polish in follow-up tip |
| Upload / Library / Replace / Remove controls | **PASS** | Existing picker retained |
| Auto-publish | **Not triggered** | Save draft only |

### ActiveClinic (`ac-v8-qa-mub23a6v6a6b`)

| Scenario | Result | Evidence |
| --- | --- | --- |
| Disposable admin → edit mode chrome | **PASS** | Publish / pencils |
| Shared `website-inline-edit.js` Adjust Picture | **PASS** | Same dialog copy as BB |
| Desktop/Mobile + zoom `1.40` Save draft | **PASS** | Placement attr after save: `zoom:1.4` + mobile blob |
| Reopen framing restores zoom | **PASS** | CDP zoom `1.4` |
| 390px Adjust Picture | **PASS*** | `ac-390-adjust-picture.png` · *horizontal overflow mitigated in follow-up CSS |
| Original media unchanged messaging | **PASS** | Copy + non-destructive contract |

### Evidence files

- `docs/qa/references/v2-01-universal-image-editor/bb-desktop-framing.png`
- `docs/qa/references/v2-01-universal-image-editor/bb-390-adjust-picture.png`
- `docs/qa/references/v2-01-universal-image-editor/ac-desktop-framing.png`
- `docs/qa/references/v2-01-universal-image-editor/ac-390-adjust-picture.png`

Graphical crop QA is based on hosted browser sessions, not backend-only tests.

---

## 7. Remaining gaps

1. **Full publish + live public re-check of framing CSS** after this tip’s cache bump was not re-run end-to-end in the same session as the AC save (B2 publish/render path already PASS; B3 save/reopen PASS).  
2. **Field-history UI click-through** for placement restore not re-exercised in browser (JSON/history infrastructure unchanged; placement rides along).  
3. **Fresh upload + library-select path** not re-uploaded in this B3 browser pass (controls present; prior B1/B2 media ownership coverage remains).  
4. Pre-tip AC 390 showed note truncation / mild horizontal overflow — addressed in `0675143aaffa` CSS (`overflow-wrap` + containment); hosted CSS tip confirmed serving `overflow-wrap: anywhere`.

---

## 8. Production confirmation

No production host, DB, media root, or deployment profile was modified. All interactive writes used disposable V8 testing tenants only. Credentials were not written into this report beyond disposable persona identifiers already used in V8 QA docs.

---

## Verdict line

`V2_01_UNIVERSAL_IMAGE_EDITOR_PASS`
