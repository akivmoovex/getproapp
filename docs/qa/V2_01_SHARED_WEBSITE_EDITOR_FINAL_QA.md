# V2.01 Shared Website Editor — Final QA

**Task:** `V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` (`blessboard.neuniversity.org` / `activeclinic.neuniversity.org`)  
**Baseline (E1 functional):** `9f2de31a8d88`  
**Release tip under test (local = origin/V8 = hosted):** `c00dce009716`  
**Note:** Hosted tip is **ahead** of E1 functional by the E1 QA doc commit `c00dce00` — expected, not a mismatch blocker.  
**Deployment identity:** `moovex-platform-v8-testing`  
**DB identity:** `expectedIdentityKey=moovex-platform-v7` · `environment=testing` · `mediaWriteNamespace=testing-v8` · `schemaCompatible=true`  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` / `moovex-platform-production`)

**Stitch:** Website Change Management System `projects/12538817760086591589`  
**Personas:** disposable `bb-v8qa-mub23a6v6a6b` (HQ + Campus A branch admin) · `ac-v8-qa-mub23a6v6a6b`

**Working tree preserved (uncommitted, unrelated):** prior AC UX / BB parity / architecture / image-payload docs + reference PNGs.

---

## FINAL VERDICT

**`V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA_PASS`**

Today’s integrated hosted journey verified draft → preview → publish, theme switch/rollback, HQ/branch website cards + WE01 editor, cross-product isolation, and auth denials for BB and AC on tip `c00dce009716`. Automated V2.01 regression suites are green. Residual gaps (browser image crop click-through, field-restore POST CSRF harness, structured-item mutate API) are documented as **NOT TESTED** today — not observed product failures. **Do not promote to production.**

---

## 1. Environment and release precheck

| Check | Result |
| --- | --- |
| Local `V8` SHA | `c00dce009716` |
| `origin/V8` SHA | `c00dce009716` (match) |
| Hosted BB SHA | `c00dce009716` / `moovex-platform-v8-testing` / `testing` |
| Hosted AC SHA | `c00dce009716` (match) |
| vs E1 baseline `9f2de31a8d88` | Tip ahead by QA-doc commit only — reported before testing |
| DB identity / media namespace | `moovex-platform-v7` / `testing-v8` |
| Schema compatible | `true` |
| Pending migrations | None indicated by `/healthz` (`schemaCompatible`) |
| Production | `03a89106e2fe` / `moovex-platform-production` |

---

## 2. Automated regression (today)

```
node --test tests/v2-01-shared-hq-branch-website.test.js \
  tests/v2-01-first-additional-themes.test.js \
  tests/v2-01-shared-theme-gallery.test.js \
  tests/v2-01-shared-theme-infra.test.js \
  tests/v2-01-universal-image-editor.test.js \
  tests/v2-01-shared-image-placement.test.js \
  tests/v2-01-shared-image-payload-contract.test.js \
  tests/v2-01-shared-section-management.test.js \
  tests/v2-01-bb-inline-editor-parity.test.js \
  tests/v2-01-field-history-restore.test.js \
  tests/v2-01-toolbar-reminders.test.js \
  tests/v2-01-unpublished-changes-panel.test.js
```

| Result | Count |
| --- | --- |
| Pass | **85** |
| Fail | **0** |
| Skipped | **3** (pre-existing DB-gated skips) |

Hygiene fix applied during this QA: `tests/v2-01-universal-image-editor.test.js` cache-bump assertion accepts E1 `v2-scope-e1-*` CSS query (was stale `v2-img-editor-2` only).

---

## 3. Hosted integrated journey (today)

Scripted disposable-tenant run: **66 / 66 PASS** (`FINALQA-muhldh6c` stamp).

### BlessBoard

| Scenario | Result |
| --- | --- |
| Open inline edit (`/c/…/hq?website_edit=1`) | **PASS** — WE01 shell, site name Headquarters |
| Pencil / field markers | **PASS** |
| Text draft save + refresh persist | **PASS** — `saved_to_draft`, pending reflected |
| Live anonymous lacks draft | **PASS** |
| Preview shows draft | **PASS** |
| Theme draft `bb.contemporary-fellowship` | **PASS** — `published:false` |
| Live theme unchanged while draft | **PASS** — stayed `bb.default` |
| Cross-product theme `ac.default` | **PASS** — `400 invalid_theme` |
| Publish | **PASS** — `code=published` |
| Anonymous live text + alternate theme | **PASS** |
| Theme restore `bb.default` + publish | **PASS** — content preserved |
| Field history GET | **PASS** |
| Website cards (4 / 3 branches) + HQ caution | **PASS** |
| Campus A/B WE01 editor | **PASS** |
| Inheritance settings controls | **PASS** |
| Branch admin Campus A allowed / Campus B no editor | **PASS** |
| Anon draft/publish denied | **PASS** |
| Theme gallery product-isolated | **PASS** |
| Add Section chrome | **PASS** |
| Pending returns to 0 after publishes | **PASS** (`data-website-pending-count="0"`) |

### ActiveClinic

| Scenario | Result |
| --- | --- |
| Open inline edit | **PASS** |
| Site name; no Change Website menu | **PASS** |
| Text draft / preview / publish / anon live | **PASS** |
| Theme draft mint → publish → restore default | **PASS** |
| Cross-product theme rejected | **PASS** — `400 invalid_theme` |
| Single clinic website card; no facility cards | **PASS** |
| Wrong clinic / anon denied | **PASS** |
| Gallery product-isolated | **PASS** |
| Doctors page rail present | **PASS** (markup) |
| BB session cannot edit AC | **PASS** (`editor=0`) |

### Extra security probes (today)

| Scenario | Result |
| --- | --- |
| BB foreign media draft | **PASS** — `404 media_not_found` |
| BB invalid image payload | **PASS** — `400 validation_failed` |
| AC foreign media draft | **PASS** — `404 media_not_found` |
| HQ published heading on Campus A live | **PASS** — stamp **not** present (no false isolation claim; field independent) |

---

## 4. Theme and image compatibility

| Product | Alternate | Draft / live gate / publish / rollback | Content preserved |
| --- | --- | --- | --- |
| BB | `bb.contemporary-fellowship` | **PASS** today | **PASS** |
| AC | `ac.family-wellness-mint` | **PASS** today | **PASS** |

Cross-product selection rejected both ways. Compatibility flags on theme select remained healthy in prior C3 evidence; today’s selects returned `published:false` then flipped live only after publish.

Image slot framing: hero aspects remain registry-backed (C3). Browser crop/position dialog click-through **NOT TESTED** this run (see §7).

---

## 5. HQ / branch scope

| Item | Result |
| --- | --- |
| Authorized cards only | **PASS** — HQ + branch cards for HQ admin |
| Same WE01 editor per selection | **PASS** — Campus A/B |
| Change Website (HQ multi-site) | **PASS** — present on HQ edit |
| Inheritance labels / return-to-default UI | **PASS** — settings page |
| AC facility websites / HQ inheritance | **NOT SUPPORTED** (explicit copy on websites list) |
| Unconditional branch isolation after HQ publish | **NOT CLAIMED** — HQ caution shown; Campus A did not show this run’s HQ heading stamp |

---

## 6. Responsive / Stitch

| Item | Result |
| --- | --- |
| BB/AC mobile nav markup | **PASS** |
| Website cards stack CSS (`max-width: 640px`) | **PASS** |
| Hosted Choose Website ~390 card stack | **PASS** (prior E1 browser + today’s list markup) |
| Stitch Screen 7 three-column studio | **NOT PRESENT** (intentional — cards only) |
| WCAG AAA | **NOT ASSESSED** |

Visual gaps (not functional defects): Stitch marketing mockups are richer than CSS-pack themes; Cursor browser panel width may understate desktop photography.

---

## 7. NOT TESTED / residual today

| Scenario | Status | Notes |
| --- | --- | --- |
| Browser upload-from-computer | **NOT TESTED** | Image field markers present; foreign media API reject PASS |
| Browser crop/position desktop+mobile | **NOT TESTED** | Automated placement/payload suites PASS (85) |
| Media library picker click-through | **NOT TESTED** | |
| Structured item add/edit/remove mutate | **NOT TESTED** | Section chrome + AC doctors rail present |
| Field restore POST → draft → republish | **NOT TESTED** | History GET PASS; restore probe hit CSRF in harness |
| Failed-publish UX copy | **NOT TESTED** | Happy-path publish PASS both products |

No P0 product defects observed on tested paths.

---

## 8. Bugs / severity

| ID | Severity | Notes |
| --- | --- | --- |
| Residual image/structured UI click-through not re-run today | **P2** | Verification gap, not a reproduced failure |
| Field-restore POST harness CSRF | **P2** | Endpoint GET healthy; retest with form/_csrf body |
| Universal image test cache-bump drift | **Fixed** | Assertion updated for E1 CSS query |

**P0 / P1 release blockers:** none found on today’s tested release-critical path.

---

## 9. Supported vs unsupported

**Supported (verified today):** shared WE01 edit shell; text draft/preview/publish; theme gallery + draft/publish/rollback; HQ/branch website cards; AC single-clinic selector; auth/cross-product isolation; foreign media rejection APIs.

**Unsupported / out of scope:** AC facility websites; network-wide publish; three-column studio; WCAG AAA claim; remaining Stitch theme packs.

---

## 10. Shared platform services verified today

Editor shell, drafts, publish, theme GET/POST, theme gallery HTML, website scope list, field-history GET, pending count, public theme body attrs, CSRF-gated mutations, product theme isolation.

---

## 11. Release readiness

| Question | Answer |
| --- | --- |
| Safe to continue V8 testing on tip? | **Yes** |
| Promote to production? | **No** |
| Final hosted SHA | `c00dce009716` |
| Production untouched? | **Yes** (`03a89106e2fe`) |

---

## FINAL VERDICT (repeat)

**`V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA_PASS`**
