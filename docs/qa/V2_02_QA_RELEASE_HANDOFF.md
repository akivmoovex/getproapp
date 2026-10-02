# V2.02 QA Release Handoff

**Task:** `V2_02_QA_RELEASE_HANDOFF`  
**Date:** 2026-09-26T12:54:42Z  
**Branch:** `V9`  
**Version:** **2.02**  
**Tag:** `v2.02`  
**Testing hosts:** `blessboard.pronline.org`, `activeclinic.pronline.org`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_READY_FOR_QA`**

Version **2.02** is ready for formal QA on pronline testing. Frozen release tag **`v2.02`** peels to `3b94485c…`. Hosted testing currently runs a **strict descendant** tip (`f8e73499…`) that adds pronline profile alignment (About **2.02** / `platformLine=v8`) plus QA docs. About and Release Notes **2.02** are live on BB and AC. Production was not promoted.

---

## 1. Environment verification

| Item | Value |
| --- | --- |
| **origin/V9 SHA** | `f8e734995a8abd8818f0025bef227500aef555c4` |
| **Hosted BB SHA** (`/healthz`) | `f8e734995a8a` |
| **Hosted AC SHA** (`/healthz`) | `f8e734995a8a` |
| **Frozen release SHA** (`v2.02^{}`) | `3b94485ce72bdb8c7f4d6d692033ab080ae51bf3` |
| Hosted == frozen? | **NO** — hosted is **4 commits ahead** of freeze |
| **platformLine** | `v8` |
| **deployment code** | `moovex-platform-testing` |
| **DB identity / env** | `moovex-platform-v7` / `testing` |
| **About version** | **2.02** (BB Release 2.02 + Version 2.02; AC Version 2.02) |
| **Release Notes 2.02** | **PASS** BB+AC (`/release-notes/2.02`, includes CONVERGED / LOCAL QA PASS) |
| **V8 baseline** (`origin/V8`) | `b186991d7db5334bfaa235f8a0ecf37428ea4a5a` (unchanged) |
| **Production SHA** | `origin/V7-first-production` = `03a89106e2fef8a93e31015d160acf73ab59fd40` (**untouched**) |

### Hosted vs freeze delta

```text
f8e73499 Refresh pronline profile alignment QA with current hosted SHA.     → QA_ONLY
3a9fa6f7 Record hosted PASS for V9 pronline profile alignment.            → QA_ONLY
d05f93ee Align pronline testing profile to V8 platform line for V9 2.02. → APPLICATION_CHANGE
2ff400a2 Correct V2.02 freeze report to match tag v2.02 peel.             → DOC_ONLY
```

| Classification | Meaning for QA |
| --- | --- |
| **APPLICATION_CHANGE** | Pronline `moovex-platform-testing` now uses `platformLine=v8` so About shows **2.02** (required for V9 testing on these hosts). Domain isolation vs neuniversity preserved. |
| **QA_ONLY / DOC_ONLY** | Handoff / freeze / alignment evidence docs only. |

**QA candidate SHA (what testers hit on pronline today):** `f8e734995a8abd8818f0025bef227500aef555c4`  
**Frozen release SHA (tag `v2.02`):** `3b94485ce72bdb8c7f4d6d692033ab080ae51bf3`

Do **not** treat SHA mismatch as a handoff blocker: tip is intentional post-freeze testing alignment; freeze tag remains the named RC pointer.

---

## 2. QA handoff scope (tested V2.02 functionality)

Prior evidence: `V2_02_FINAL_REGRESSION_PASS`, shared RBAC CONVERGED, BB catalogue-only, AC alignment, PA convergence, legacy role runtime zero, pronline profile alignment PASS.

### PLATFORM

- Shared identity  
- Shared roles / permissions catalogue  
- Shared authorization primitives  
- Platform administrator RBAC (`platform_administrator` + `platform.*`)

### BLESSBOARD

- Catalogue-only RBAC  
- No legacy login authorization (`user_roles` not on auth decision path)  
- Staff / access  
- HQ / branch scope  
- Website editor  
- Image placement  
- Themes  
- Publishing (incl. editor deny publish)

### ACTIVECLINIC

- Shared RBAC  
- Org / facility assignments  
- `patient.create` policy (migration 115 families)  
- Staff / access  
- Website editor  
- Booking  
- Services / doctors  
- Themes / publishing  

### SHARED

- Cross-product isolation  
- Cross-tenant isolation  
- Publish authorization  
- Media ownership / placement  
- Responsive ~390px flows (editor / UIE CSS; visual spot-check in QA)

### Suggested smoke order (hosted)

1. BB+AC `/about` = 2.02; `/release-notes/2.02` present  
2. `/healthz` identity + `platformLine=v8` + SHA note  
3. Public `/` + `/login` both products  
4. Authz: editor cannot publish; PA catalogue gate; AC `patient.create` allow/deny families  
5. Isolation: wrong-org / cross-product deny  
6. Editor: placement, theme switch, publish happy-path with publisher role  

---

## 3. Release notes

| Surface | Result |
| --- | --- |
| `https://blessboard.pronline.org/release-notes/2.02` | **200** — Version / Release Notes **2.02**; CONVERGED / LOCAL QA PASS wording present |
| `https://activeclinic.pronline.org/release-notes/2.02` | **200** — same |

---

## 4. Known deferred / non-blocking items

*(Do not re-open closed product P1s such as RC-MEDIA-PLACE / BB-THEME-503.)*

| Item | Severity | Notes |
| --- | --- | --- |
| Chrome `/c/…?website_edit=1` **301** vs test **200** | P2 test | Not permission elevation |
| `user_roles` display / directory dual-read soak | P2 | Auth path zero; drop table deferred |
| HQ role-admin UI legacy labels | P2 | Soak |
| Phase F physical `platform.roles` relocate | P2/P3 | Explicit non-goal |
| HOST-PKG-A | P0 **ops** | Hostinger www/worker — not product RBAC |
| BACKUP-PROD-VERIFY | P0/P1 ops | Restore evidence |
| V8-001 email delivery | P1 ops | Initiation ≠ delivery |
| Production tip lag / promote | Ops | Requires separate approval — **out of QA handoff** |
| Hosted SHA ≠ freeze tag | Process | Documented; tip = freeze + pronline 2.02 alignment |

---

## 5. Production untouched confirmation

| Check | Result |
| --- | --- |
| Prod deploy / migrate / promote in this handoff | **NO** |
| `origin/V7-first-production` | `03a89106e2fe…` (unchanged by this work) |
| Merge V9 → V8 | **NO** |

---

## Return block

```
VERDICT: V2_02_READY_FOR_QA
QA_CANDIDATE_SHA: f8e734995a8abd8818f0025bef227500aef555c4
FROZEN_RELEASE_SHA: 3b94485ce72bdb8c7f4d6d692033ab080ae51bf3
HOSTED_SHA: f8e734995a8a (BB=AC)
DELTA: APPLICATION_CHANGE (pronline platformLine=v8) + QA_ONLY + DOC_ONLY
TEST_SCOPE: platform RBAC; BB catalogue-only; AC patient.create + editor/booking; shared isolation/publish/media/390px
DEFERRED: chrome 301 P2; user_roles dual-read; HQ labels; Phase F; HOST-PKG-A; backup; email; prod promote
PRODUCTION_UNTOUCHED: YES
```
