# V2.02 Version & Release Notes QA

**Task:** `V2_02_VERSION_AND_RELEASE_NOTES`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Testing target:** `moovex-platform-v8-testing`  
**Production:** **DO NOT TOUCH** — remained `03a89106e2fe` / `moovex-platform-production`

**Functional / hosted commit:** `51a9f1a1802a`  
**Evidence:** `/tmp/v2_02_version_release_notes_qa.json` · screenshots `/tmp/v2_02_version_shots/`

---

## Verdict

### **`V2_02_VERSION_RELEASE_NOTES_PASS`**

BlessBoard and ActiveClinic About pages show **Version 2.02** with separate Git build SHA. Shared Release Notes Center lists **2.02** on hub, BlessBoard, and ActiveClinic hosts with evidence-backed features only. Prior 2.01 notes remain reachable. Production untouched. Hosted matrix **15/0 PASS**.

---

## 1. Changes

| Area | Change |
| --- | --- |
| About version | `VERSION_BASE_V8` / `PRODUCT_VERSION_V8` → `2.02` in `applicationBuildInfo.js` |
| Release notes | Catalog version **2.02** with BB/AC/Shared features; overview lede `1.0–2.02` |
| Asset cache | RNC CSS/JS `?v=v2-02-rnc-1` |
| Reminder badge default | `v2.02 • SafeDraft Protection` |
| Tests | About + RNC catalog assertions updated |

### 2.02 notes include (verified claims only)

- Shared WE01 editor parity (SP-T1–T7, U1-A–D)
- SP-VIS reminder / publish-failure UX
- Shared image placement + Universal Image Editor
- Theme gallery + alternate theme switching
- BB HQ/branch website scope cards
- AC single-clinic website card
- P1 blockers: RC-MEDIA-PLACE PASS, BB-THEME-503 PASS; retest 34/0/0
- Shared security + publish authorization PASS
- AC booking FIXED_PASS

### Explicit non-claims

- Production promotion  
- HOST-PKG-A closure  
- Backup verification  
- AC facility websites  
- Extra theme packs beyond the two alternate CSS packs  
- Deferred backlog items  

---

## 2. Hosted verification

| Check | Result |
| --- | --- |
| Hosted SHA | **`51a9f1a1802a`** · `moovex-platform-v8-testing` (BB + AC + hub) |
| Production `/healthz` | **`03a89106e2fe`** · unchanged |
| BB `/about` | **200** · Version 2.02 · Release 2.02 · build SHA present |
| AC `/about` | **200** · Version 2.02 · Enterprise v2.02 |
| Hub `/release-notes` | **200** · includes 2.02 |
| Hub `/release-notes/2.02` | **200** |
| BB `/release-notes` + `/2.02` | **200** |
| AC `/release-notes` + `/2.02` | **200** |
| BB/AC `/release-notes/2.01` regression | **200** (prior notes intact) |
| RNC CSS `v2-02-rnc-1` | **200** |
| Desktop 1440 + 390px shots | **PASS** (About + 2.02 notes BB/AC) |

Local unit tests: `tests/v8-about-version-2.test.js` + `tests/v2-01-release-notes-center.test.js` → **35/35 PASS**.

---

## 3. Files touched

- `src/platform/build/applicationBuildInfo.js`
- `src/platform/release-notes/releaseNotesCatalog.js`
- `src/platform/release-notes/attachReleaseNotesRoutes.js`
- `views/platform/release-notes/overview.ejs`
- `views/platform/website-engine/publishing-reminder.ejs`
- `tests/v8-about-version-2.test.js`
- `tests/v2-01-release-notes-center.test.js`

---

## Return token

```
V2_02_VERSION_RELEASE_NOTES_PASS
hosted_sha=51a9f1a1802a
about=2.02_bb_ac
release_notes=2.02_hub_bb_ac
prod_untouched=03a89106e2fe
hosted_matrix=15/0
local_tests=35/35
```
