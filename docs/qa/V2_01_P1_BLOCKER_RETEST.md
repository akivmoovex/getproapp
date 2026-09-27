# V2.01 P1 Blocker Retest

**Task:** `V2_01_P1_BLOCKER_RETEST`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing` only  
**Production:** **DO NOT TOUCH** — remained `03a89106e2fe` / `moovex-platform-production` (no deploy)

**Refs:**  
- `docs/qa/V2_01_RC_MEDIA_PLACEMENT_FIX_QA.md`  
- `docs/qa/V2_01_BB_THEME_503_FIX_QA.md`  
- `docs/qa/V2_01_P1_RELEASE_GATE_SUMMARY.md`

**Scope:** Rerun **only** scenarios tied to the two P1 product blockers (+ websites scope route called out with BB-THEME-503, and a small AC shared regression). Unrelated PASS suites were **not** re-run.

**Personas (disposable):**  
- BB HQ · `bb-v8qa-mub23a6v6a6b`  
- BB branch_admin (deny check)  
- AC admin · `ac-v8-qa-mub23a6v6a6b`

**Evidence:** `/tmp/v2_01_p1_blocker_retest.json`

---

## Verdict

### **P1 gate (testing tip blocker retest): `CLEAR`**

| Blocker | Retest |
| --- | --- |
| **RC-MEDIA-PLACE** | **PASS** |
| **BB-THEME-503** | **PASS** (includes BB websites scope/cards) |

| Surface | Value |
| --- | --- |
| Hosted SHA | **`e7d4b1aecf2c`** |
| Deployment | `moovex-platform-v8-testing` · `testing` |
| Production SHA | **`03a89106e2fe`** (untouched) |
| Matrix | **34 PASS / 0 FAIL / 0 BLOCKED** |
| Regressions | **None** |

**Production RC gate:** still **BLOCKED** until the promotion branches are cut over (`v2-01-rc-media-placement` / `v2-01-rc-bb-theme-503`). This retest does **not** clear production in place; it clears the product blockers on the V8 testing tip that carries the fixes.

---

## 1. What was retested

| # | Scenario | Result |
| --- | --- | --- |
| 1 | BB + AC media placement persistence (upload → draft D/M placement → invalid zoom reject → refresh → preview → publish → public → CDN URL) | **PASS** both products |
| 2 | BB theme gallery (path + HQ alias + cards) | **PASS** |
| 3 | BB website scope/cards (`/website/websites` + HQ alias) | **PASS** |
| 4 | BB functional pack affected steps (draft theme select, preview signal, restore default draft, auth deny) | **PASS** |
| 5 | AC regression (theme gallery + single-clinic website card; placement covered in #1) | **PASS** |

---

## 2. RC-MEDIA-PLACE — **PASS**

| Check | BB | AC |
| --- | --- | --- |
| Login + edit mode | PASS | PASS |
| Upload image | PASS | PASS |
| Save draft with D/M placement (`zoom: 1.35`) | PASS `saved_to_draft` | PASS `saved_to_draft` |
| Invalid zoom rejected | PASS `validation_failed` | PASS `validation_failed` |
| Refresh persists framing | PASS (`--gp-img-zoom` / data attr / `1.35`) | PASS |
| Preview (draft) | PASS | PASS |
| Publish | PASS `published` | PASS `published` |
| Public placed CSS | PASS | PASS |
| CDN URL unchanged | PASS | PASS |

---

## 3. BB-THEME-503 — **PASS**

| Check | Result |
| --- | --- |
| `GET …/hq/website/themes` (path) | **200** Choose Website Theme |
| Default + alternate theme cards | **PASS** |
| `GET /hq/website/themes` | **303** → `/c/…/website/themes` (rid `e0a9d803e8da76614bfad236`) |
| `GET …/hq/website/websites` | **200** scope cards (57 markers) |
| `GET /hq/website/websites` | **303** → `/c/…/website/websites` |
| Draft select `bb.contemporary-fellowship` | **PASS** `published:false` |
| Preview draft theme signal | **PASS** |
| Restore default draft | **PASS** |
| Anon denial | **401** |
| Branch HQ themes denial | **403** |

---

## 4. AC shared regression — **PASS**

| Check | Result |
| --- | --- |
| AC theme gallery | **200** |
| AC single-clinic website card | **200** |
| AC placement lifecycle | **PASS** (same matrix as §2) |

No AC regressions observed from shared placement/theme/websites tip code.

---

## 5. Regressions

**None.** All 34 scoped checks PASS. No new failures in media, themes, websites, or AC shared surfaces.

---

## 6. Gate reading vs original P1 summary

| Gate lens | Status |
| --- | --- |
| Original prod RC `03a89106e2fe` (pre-promote) | Still missing placement + theme/websites routes → **BLOCKED** until promote |
| V8 testing tip `e7d4b1aecf2c` (fixes present) | Both P1 product blockers **PASS** → **CLEAR** for tip |
| Promo packages | `v2-01-rc-media-placement` · `v2-01-rc-bb-theme-503` (theme stacked on media) |

Owner next step for **production** CLEAR: promote the RC packages (or equivalent), then re-run disposable prod placement + BB theme/websites smoke. **Not performed** in this task.

---

## Return token

```
V2_01_P1_BLOCKER_RETEST = CLEAR
RC-MEDIA-PLACE=PASS
BB-THEME-503=PASS
regressions=none
hosted_sha=e7d4b1aecf2c
deployment=moovex-platform-v8-testing
prod_untouched=03a89106e2fe
matrix=34/0/0
p1_gate_testing_tip=CLEAR
p1_gate_production_rc=BLOCKED_pending_promote
```
