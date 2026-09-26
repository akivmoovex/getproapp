# V2.01 BlessBoard Backlog Closure QA

**Task:** `V2_01_BLESSBOARD_BACKLOG_CLOSURE`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Environment:** `moovex-platform-v8-testing`  
**Production:** **untouched** (`blessboard.com` `03a89106e2fe` · `moovex-platform-production`)

**Inputs:** `docs/qa/V2_01_MASTER_BACKLOG_AUDIT.md`, `docs/backlog/V2_BB_WEBSITE_EDITOR_BUGS.md`, `docs/backlog/V2_MEDIA_BACKLOG.md`, V2.01 editor/section/theme/publish QA, V1.3 BB release notes

**Excluded:** shared infra I1/I3 · shared editor U1 (SP-T2…T5) · AC-only work · facility websites · redesigning BB public site to match AC visuals

---

## Verdict

**`V2_01_BLESSBOARD_BACKLOG_CLOSURE_COMPLETE`**

Investigation targets (registration, public pages/sections, leadership/ministry editing, sermons/giving/contact surfaces, structured persistence, directory navigation, prior About draft hydration) are **FIXED_VERIFIED** or **DESIGN PENDING** on current V8 testing — no reopen of fixed image/publish bugs.

One confirmed OPEN BB-leaning polish item was closed:

| ID | Change | SHA |
| --- | --- | --- |
| **SP-T6** | Choose Website HQ/branch card densify + badge/mobile stacking | `6dbf600e0a5b` |

**Still OPEN (not claimed closed):** **V8-003** (catalogue-only login policy), **V2-MEDIA-01** + **V2-BB-SERMONS/GIVING/CONTACT** (design/privacy gated), VQ fixture/visual PARTIALs.

AC catalogue + BB contact regressions stayed green. Production untouched.

---

## Environment

| Surface | Value |
| --- | --- |
| Product tip | `6dbf600e0a5b` |
| Disposable church | `bb-v8qa-mub23a6v6a6b` |
| Hosted BB during smoke (pre-SP-T6 deploy) | `aa12b6296b9f` then tip `6dbf600e` |
| Production | `03a89106e2fe` · **unchanged** |

Smoke artifact: `docs/qa/references/v2-01-bb-backlog-closure-smoke.json`

---

## Investigation matrix

| Original / topic ID | Severity | Before | After | Files / tests | Evidence |
| --- | --- | --- | --- | --- | --- |
| **Registration / onboarding** (`/register-church`, V8 Prompt 06) | — | CODE_PASS ancestry | **FIXED_VERIFIED** | Existing membership/activity suites | Hosted `/register-church` **200** |
| **Public directory → church** | — | Apex marketing PASS | **FIXED_VERIFIED** | `blessboard-apex-marketing` | `/directory` **200**; sample `/c/…/hq` **200** |
| **Public pages** (home/about/leadership/ministries/sermons/giving/contact/events) | — | Final/P2 editor PASS | **FIXED_VERIFIED** | Public routing + editor shells | All **200** on disposable HQ |
| **Content sections / freeform** | — | Section management PASS | **FIXED_VERIFIED** | `v2-01-shared-section-management`, `v8-shared-website-sections` | Local **PASS** |
| **Leadership / ministry editing** | — | P2 structured PASS | **FIXED_VERIFIED** | P2 ministry mutate; edit pencils present | Edit mode **200**; pencils ≥10; P2 **48/48** ancestry |
| **Structured content persistence** | — | P2 PASS | **FIXED_VERIFIED** | BB ministry structured draft | Prior hosted add/edit/publish PASS; not reopened |
| **V2-BB-18** Our Values `unknown_content_key` | P1 | FIXED in register | **FIXED_VERIFIED** | `v2-bb-contact-hours-edit` | Local **PASS**; master audit skip list |
| **V2-BB-20** Contact opening hours | P1 | HOSTED PASS `0ddee769` | **FIXED_VERIFIED** | same | Local **PASS**; contact edit **200** / 23 pencils |
| **V1.3 About `data-draft` hydration** | Major (historical) | FIXED_UNVERIFIED | **FIXED_VERIFIED** | Editor chrome | Hosted about draft edit `data-draft="1"` + editor chrome present |
| **Sermons / Giving / Contact** functional edit | — | Editor pencils live | **FIXED_VERIFIED** (functional) | Public templates + WE01 | Edit pages **200**; redesigns remain design-gated |
| **V2-BB-SERMONS-01 / GIVING-01 / CONTACT-01** | P1 design | DESIGN PENDING | **OPEN (DESIGN PENDING)** | — | Requires design + **V2-MEDIA-01**; **no redesign this task** |
| **V2-MEDIA-01** YouTube embeds | P1 shared | NOT IMPLEMENTED | **OPEN** | Shared media backlog | Privacy review + allow-list not in this BB closure |
| **SP-T6** HQ/branch card density | P2 | OPEN | **FIXED_VERIFIED** | `website-scope-list.css`, `renderWebsiteScopeList.js` | Commit `6dbf600e`; cache `v2-spt6-cards-1`; hq-branch test PASS |
| **V8-003** catalogue-only login | P3 | OPEN | **OPEN (policy)** | Auth backlog | Do not invent companion-role bypass without product decision |
| Image / publish bugs | — | UIE / Final / P2 PASS | **Not reopened** | — | No current reproducible failure |

---

## Code change this task

### SP-T6 — Choose Website cards

| Field | Value |
| --- | --- |
| **Commit** | `6dbf600e` |
| **Severity** | P2 visual/usability |
| **Files** | `public/platform/website-scope-list.css`, `src/platform/website/renderWebsiteScopeList.js`, `tests/v2-01-shared-hq-branch-website.test.js` |
| **Behavior** | Stronger current-card ring; denser badge stack; ≥44px-ish mobile actions full-width; CSS cache `v2-spt6-cards-1` |
| **Non-goals** | No three-column studio; no AC multi-site invention; no theme redesign |

---

## Regression

```text
node --test \
  tests/v2-01-shared-hq-branch-website.test.js \
  tests/v2-bb-contact-hours-edit.test.js \
  tests/v7-website-public-catalogue.test.js \
  tests/activeclinic-clinic-directory.test.js
```

**Result:** **30/30 PASS** (BB + AC catalogue/directory kept green).

Also green earlier this session: section management + apex marketing (**27/27**).

---

## Hosted smoke (disposable `bb-v8qa-mub23a6v6a6b`)

| Check | Result |
| --- | --- |
| `/register-church` | **200** |
| `/directory` → church | **200** |
| Public HQ pages listed above | **200** |
| About draft `data-draft` | **`1`** + editor chrome |
| Leadership / ministries / sermons / giving / contact edit | **200** with pencils |
| `/c/…/website/websites` (scope list) | **200** · `data-gp-website-scope-list` |
| Wrong path `/website/scopes` | **503** (non-route; not a product defect — correct path is `/website/websites`) |

---

## Remaining gaps

| ID | Severity | Notes |
| --- | --- | --- |
| **V8-003** | P3 | Catalogue-only `website_editor` / `website_publisher` login needs policy |
| **V2-MEDIA-01** | P1 | YouTube-only embeds (shared) |
| **V2-BB-SERMONS-01** | P1 | Design pending after MEDIA-01 |
| **V2-BB-GIVING-01** | P1 | Design pending after MEDIA-01 |
| **V2-BB-CONTACT-01** | P1 | Contact video→image redesign pending design |
| **VQ-FIX-*** / Form Studio PARTIALs | P1–P2 | Fixture / visual polish; Prompt 42 deferred non-blockers |
| Shared SP-T7 / SP-VIS-* | P2 | Outside this BB-specific closure (U1/shared tracks) |

---

## Production untouched

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| This task | Testing-only deploy of SP-T6 CSS + docs |

---

## FINAL VERDICT (repeat)

**`V2_01_BLESSBOARD_BACKLOG_CLOSURE_COMPLETE`**

Functional BB investigation paths are verified on V8 testing; SP-T6 card densify shipped at `6dbf600e`. Design-gated sermons/giving/contact and V8-003 policy remain explicitly open — not silently marked fixed.
