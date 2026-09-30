# V2.04 — QA Release Freeze + Handoff

**Status:** LOCAL RELEASE FROZEN · HOSTED QA DEPLOY PENDING  
**Date:** 2026-09-30  
**Branch:** `V4`  
**Gate:** `BATCH_8_FINAL_LOCAL_RELEASE_FREEZE`

Supersedes the earlier color-system freeze tip (`117b03ef…`) for **hosted QA of the full V2.04 packet**. Historical color-system acceptance evidence for `117b03ef…` remains valid for that earlier scope; the **application candidate for next neuniversity deploy** is below.

---

## 1. Frozen application candidate (Batch 8)

| Field | Value |
| --- | --- |
| `V2_04_HOSTED_QA_CANDIDATE` | `c16c791f9a4d102aa213debb3f4f0975c258c487` |
| Short SHA | `c16c791f9a4d` |
| Branch | `V4` |
| Environment (target) | `testing` / `moovex-platform-v8-testing` |
| Hosts (expected after deploy) | `blessboard.neuniversity.org`, `activeclinic.neuniversity.org` |

**Rule:** A later **docs-only** tip must **not** replace `V2_04_HOSTED_QA_CANDIDATE`. Only a newer **application** commit may supersede it.

At Batch 8 freeze verification:

| Check | Result |
| --- | --- |
| `git branch --show-current` | `V4` |
| Pre-gate application SHA | `6be8065bc7dccbfcc07e8fbf8254472f98384270` |
| Batch 8 application SHA (hosted QA candidate) | `c16c791f9a4d102aa213debb3f4f0975c258c487` |
| Batch 7 verdict | `V2_04_BATCH_7_STITCH_VISUAL_PARITY_PASS` |
| Production | **UNTOUCHED** |
| Pronline V10 | **PRESERVED** |
| Neuniversity deploy | **PENDING** |

---

## 2. Testing topology

| Item | Value |
| --- | --- |
| Local branch | `V4` |
| Shared version source | `src/platform/build/applicationBuildInfo.js` (`VERSION_BASE_V8` / `PRODUCT_VERSION_V8` = `2.04`) |
| About | BB + AC render **Version 2.04** on V8 testing profile |
| Migration ceiling | Platform website lifecycle + BB→platform engine migration closed; no further platformization in Batch 8 |
| DB | Do **not** reset shared testing DB for Batch 8; preserve recorded clean-DB evidence |

---

## 3. Clean-DB evidence (preserved — do not re-wipe)

Source: `docs/qa/V2_04_BB_PLATFORM_ENGINE_MIGRATION.md`

| Check | Result |
| --- | --- |
| `CLEAN_DB_MIGRATION` | **PASS** |
| `BB_CLEAN_DB_E2E` | **PASS** |
| `AC_CLEAN_DB_E2E` | **PASS** |

Ephemeral foundation bootstrap only; shared neuniversity was **not** wiped for that evidence.

---

## 4. Stitch parity freeze

| Metric | Value |
| --- | ---: |
| `LOCAL_STITCH_PARITY` | **84.3** |
| Public | **85.0** |
| Editor | **79.8** |
| Hub | **84.4** |
| Logical screens | **20/20** |
| Physical Stitch references | **38/38** |
| Public desktop / mobile | **12/12** · **12/12** |
| Editor desktop / mobile | **1/1** · **1/1** |
| Hub desktop / mobile | **6/6** · **6/6** |
| `LOCAL_EXACT_SCORING_LIMITATION` | `HOSTED_RENDER_REQUIRED` |

Remaining **HIGH** gaps (non-blocking): E01/E02 editor chrome (floating section toolbars / image-adjust modal).  
Remaining **MEDIUM**: 9 H03/H06 `FUTURE_CAPABILITY` controls (intentionally not implemented) + lack of hosted pixel EXACT evidence.

---

## 5. FUTURE_CAPABILITY freeze

| Disposition | Count |
| --- | ---: |
| `WIRE_EXISTING` | 5 |
| `PRESENTATION_ONLY` | 1 (`header_style_mode`) |
| `FUTURE_CAPABILITY` | **9** |
| `BLOCKER` | 0 |
| `FALSE_ACTIVE_FUTURE_CONTROLS` | **0** |

Runtime UI uses hint / read-only informational treatment — no fake Save, fake persistence, or hard-coded success for those controls.

---

## 6. Theme + engine freeze

| Check | Value |
| --- | --- |
| AC primary | `#006068` |
| BB primary | `#6c5ce7` |
| Theme selectors | `[data-product="activeclinic"]` / `[data-product="blessboard"]` |
| Token leaks | BB→AC **0**, AC→BB **0** |
| AC public font (Stitch) | **Inter** |
| Editor / upload / media / draft / publish / version / restore engines | **1** each |
| BB + AC lifecycle runtime paths | **PLATFORM** |
| `LEGACY_BB_LIFECYCLE_RUNTIME_REFERENCES` | **0** |
| BB↔AC coupling | **0** / **0** |

---

## 7. Color-system evidence (still authoritative)

Earlier freeze packet for color migration remains valid:

| Metric | Frozen value |
| --- | ---: |
| `UNJUSTIFIED_PLATFORM_GUI_RAW_COLORS` | **0** |
| BlessBoard primary | `#6c5ce7` |
| ActiveClinic public / auth | `#006068` |

Details: `docs/qa/V2_04_COLOR_SYSTEM_FINAL_FREEZE.md`.

---

## 8. Pronline / V10 + production

| Check | Result |
| --- | --- |
| `PRONLINE_V10_PRESERVED` | **PASS** |
| Production deploy / DB / credential / env mutation | **NONE** |
| `PRODUCTION` | **UNTOUCHED** |

Do **not** deploy V2.04 to pronline. Do **not** touch production.

---

## 9. What this freeze authorizes / forbids

**Authorized**

- Treat `c16c791f9a4d…` as the V2.04 **hosted QA** application candidate for neuniversity.
- Hosted QA of About 2.04, theme isolation, geography, website lifecycle, AC Stitch R/E/H, Batch 7 visual parity.

**Forbidden without a new gate**

- Further Stitch EXACT chasing without hosted renders.
- Implementing FUTURE_CAPABILITY controls merely for parity score.
- Architecture remigration / dual engines.
- Shared testing DB wipe for Batch 8 cosmetics.
- Production or pronline deploy.

---

## 10. Handoff checklist (next owners)

1. **Ops / QA:** Deploy `c16c791f9a4d…` (or newer application supersession) to **neuniversity** only.  
2. **QA:** Hosted pixel comparison vs Stitch when renders are available; do not block local freeze on that.  
3. **QA data:** Prefer testing-only password-reset tooling when credentials drift; never commit passwords.  
4. **Theme/CSS edits after freeze:** Bump `V204_BROWSER_ASSET_VERSION` so browsers invalidate caches.  
5. **Production:** Separate deliberate promotion gate — not this freeze.

---

## 11. Freeze verdict

```text
VERSION=2.04
BRANCH=V4
GATE=BATCH_8_FINAL_LOCAL_RELEASE_FREEZE
V2_04_HOSTED_QA_CANDIDATE=c16c791f9a4d102aa213debb3f4f0975c258c487
LOCAL_STITCH_PARITY=84.3
CLEAN_DB_MIGRATION=PASS
BB_CLEAN_DB_E2E=PASS
AC_CLEAN_DB_E2E=PASS
PRONLINE_V10_PRESERVED=PASS
PRODUCTION=UNTOUCHED
NEUNIVERSITY_DEPLOYMENT=PENDING
FINAL=V2_04_BATCH_8_FINAL_LOCAL_RELEASE_FREEZE_PASS
```
