# V2.02 Version & Release Notes QA

**Task:** `V2_02_VERSION_AND_RELEASE_NOTES`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Tip SHA (local):** `b186991d7db5` + uncommitted V9 architecture-section / badge sync  
**Production:** **DO NOT TOUCH** — remained `moovex-platform-production` / older RC (`03a89106e2fe` lineage)

**Evidence:** `/tmp/v2_02_version_release_notes_qa.json` · screenshots `/tmp/v2_02_version_shots/`

---

## Verdict

### **`V2_02_VERSION_RELEASE_NOTES_PASS`**

BlessBoard and ActiveClinic About pages show **Version 2.02** with separate Git build SHA. Shared Release Notes Center lists **2.02** for BB and AC with verified V8-inherited claims only. New section **“V2.02 architecture work in V9”** states shared RBAC consolidation is **under development** and **not claimed complete**. Desktop 1440 + 390px checks PASS. Production untouched.

---

## 1. Changes (V9)

| Area | Change |
| --- | --- |
| About version | Already `VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.02` (inherited from V8 tip) |
| Release notes | Catalog **2.02** retained; summary/deployment reframed for **branch V9** |
| Architecture section | **V2.02 architecture work in V9** — RBAC consolidation under development until QA passes |
| Asset cache | RNC `?v=v2-02-rnc-2` |
| Reminder badge | `v2.02 • SafeDraft Protection` (EJS + `changeManagerUi.js`) |
| Hub runtime copy | Release notes lede `1.0–2.02` |
| Tests | Assert architecture section + no false RBAC completion claim |

### 2.02 notes include (verified claims only)

- Shared editor parity (SP-T1–T7, U1-A–D)
- SP-VIS
- Image placement / Adjust Picture (Universal Image Editor)
- Themes and theme switching
- BB HQ/branch scope cards
- AC clinic website card
- RC-MEDIA-PLACE PASS
- BB-THEME-503 PASS
- P1 blocker retest 34/0/0
- Shared security PASS
- Publish authorization PASS
- AC booking FIXED_PASS

### Explicit non-claims

- Production promotion  
- HOST-PKG-A closure  
- Backup verification  
- AC facility websites  
- Extra theme packs beyond the two alternate CSS packs  
- **Shared RBAC consolidation complete** (under development on V9 until QA passes)

---

## 2. Verification

| Check | Result |
| --- | --- |
| Branch | **V9** (production / V8 tip not rewritten by this task) |
| BB About | **Version 2.02** · Release 2.02 · build SHA separate |
| AC About | **Version 2.02** · Enterprise v2.02 · build SHA separate |
| BB release notes `/2.02` | Includes V2.02 + architecture section |
| AC release notes `/2.02` | Includes V2.02 + architecture section |
| Architecture section title | **V2.02 architecture work in V9** |
| RBAC wording | under development · not complete · wait for dedicated QA |
| Desktop 1440 + 390px | **PASS** (BB/AC About + 2.02 notes) |
| Local unit tests | `tests/v8-about-version-2.test.js` + `tests/v2-01-release-notes-center.test.js` → **35/35 PASS** |
| Production | Untouched |

---

## 3. Files touched

- `src/platform/release-notes/releaseNotesCatalog.js`
- `src/platform/release-notes/releaseNotesService.js`
- `src/platform/release-notes/attachReleaseNotesRoutes.js`
- `views/platform/release-notes/version.ejs`
- `src/platform/website-engine/changeManagerUi.js`
- `src/platform/http/moovexPlatformRuntimeServer.js`
- `tests/v2-01-release-notes-center.test.js`
- `docs/qa/V2_02_VERSION_RELEASE_NOTES_QA.md`

---

## Return token

```
V2_02_VERSION_RELEASE_NOTES_PASS
branch=V9
about=2.02_bb_ac
release_notes=2.02_bb_ac
architecture=V2.02_architecture_work_in_V9
rbac=under_development_not_complete
viewports=1440+390
local_tests=35/35
prod_untouched=YES
```
