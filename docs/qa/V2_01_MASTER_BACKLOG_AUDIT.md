# V2.01 Master Backlog Audit

**Task:** `V2_01_MASTER_BACKLOG_AUDIT`  
**Date:** 2026-09-26  
**Branch:** `V8`  
**Mode:** **AUDIT ONLY** — no code, migrations, or deployment  
**Production:** **DO NOT TOUCH** (read-only SHA check only)

---

## Verdict

**`V2_01_MASTER_BACKLOG_AUDIT_COMPLETE`**

True remaining work on V8 testing is: (1) **Stitch parity polish** `SP-T2`–`SP-T7` after verified `SP-T1`, (2) **Hostinger ops** Package A / NPROC (blocked on hPanel access), (3) **deferred V8 product backlog** (email, catalogue login, org-admin patient policy), (4) **media/content design backlog**, and (5) **non-blocking V8 visual PARTIAL/fixture debt**. Shared website editor functional path is **PASS** on hosted tip; **do not promote to production**.

---

## 1. Environment

| Surface | Value |
| --- | --- |
| Local branch | `V8` |
| Local SHA | `a901751a2c3a3a6972f4dbb5e489ef567d4769b5` |
| `origin/V8` SHA | `a901751a2c3a3a6972f4dbb5e489ef567d4769b5` (**match**) |
| Hosted BB `/healthz` | `gitSha=a901751a2c3a` · `deploymentCode=moovex-platform-v8-testing` · `environment=testing` |
| Hosted AC `/healthz` | same SHA / deployment (match) |
| DB identity | `expectedIdentityKey=moovex-platform-v7` · `expectedDatabaseEnvironment=testing` |
| Media write namespace | `testing-v8` |
| Session cookie | `moovex_platform_v8_testing_sid` |
| Schema | `schemaCompatible=true` |
| Jobs | `jobsEnabled=false` |
| Production BB `blessboard.com` | `gitSha=03a89106e2fe` · `moovex-platform-production` · **read-only** |
| Toolbar parity included? | **Yes** — tip includes `fa0853ff` + `d2ce78f3` + QA doc `a901751a`; hosted CSS `v2-toolbar-parity-2` **200** |

Untracked working-tree docs/scripts (parity references, capture harnesses) were **not** treated as deployed product state.

---

## 2. Sources consulted (relevant only)

| Source | Role |
| --- | --- |
| `docs/BACKLOG.md` | Cross-product POST-V1 deferred |
| `docs/releases/V8_BACKLOG.md` | Canonical V8 open product issues |
| `docs/backlog/V8_V2_VISUAL_QA_BACKLOG.md` | Visual FAIL/PARTIAL/fixture ledger |
| `docs/backlog/V2_BB_WEBSITE_EDITOR_BUGS.md` | V2 BB editor bug register |
| `docs/backlog/V2_MEDIA_BACKLOG.md` | Media / sermons / giving / contact video |
| `docs/qa/V2_01_STITCH_PARITY_ACTION_PLAN.md` | Latest SP-T* implementation order |
| `docs/qa/V2_01_SHARED_EDITOR_TOOLBAR_PARITY_QA.md` | SP-T1 verified PASS |
| `docs/qa/V2_01_SHARED_WEBSITE_EDITOR_FINAL_QA.md` | Integrated editor PASS |
| `docs/qa/V2_01_SHARED_EDITOR_P2_GAP_CLOSURE_QA.md` | Final-QA residuals closed |
| `docs/qa/V2_01_BB_AC_STITCH_SCREEN_PARITY_AUDIT.md` | Seven-screen parity scores |
| `docs/qa/V2_01_*` Hostinger / publish / change-manager / theme / image / section / HQ QA | Capability PASS / ops BLOCKED |
| `docs/releases/V8_QA_READINESS_PROMPT42.md` | Manual QA readiness (older tip) |
| `docs/qa/V1_3_*_QA_RELEASE_NOTES.md` | Historical freeze blockers |
| `docs/platform/KNOWN_TEST_DEBT.md` | Automated debt (POST_V1) |

**Not ingested as current open defects:** superseded architecture “NOT IMPLEMENTED” claims for themes/crop/HQ cards after later PASS QA; obsolete Stitch studio frames marked **E** in the action plan; V7 Phase-0 503 (hosts are healthy now).

---

## 3. Classification legend

| Status | Meaning |
| --- | --- |
| **OPEN** | Still unresolved; evidence supports remaining work |
| **FIXED_VERIFIED** | Closed with hosted and/or automated PASS on a newer tip |
| **FIXED_UNVERIFIED** | Fix claimed or strongly implied; specific original probe not re-run |
| **HISTORICAL** | Older environment / superseded design target |
| **DUPLICATE** | Same work tracked under another ID |
| **DEFERRED** | Explicitly deferred / out of scope / product decision pending |
| **UNKNOWN** | Insufficient current evidence — not invented as a bug |

---

## 4. Prioritized open backlog

Severity uses actual impact (P0 security/data/isolation/core blockers → P3 optional).

### 4.1 Infrastructure / ops

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **HOST-PKG-A** | Shared | `V2_01_HOSTINGER_PACKAGE_A_QA` · Unused-host audit | **OPEN** (`PACKAGE_A_BLOCKED`) | **P0** (account NPROC capacity) | Shared infra | Operator hPanel access | Unbind `www.neuniversity.org` (+ optionally `www.pronline.org`) from Node; DNS/panel redirect to apex only | Before/after PID matrix: www hosts no sticky Node PID; apex+BB+AC unchanged; no invented NPROC claim |
| **HOST-CONSOL** | Shared | `V2_01_HOSTINGER_WORKER_CONSOLIDATION_PLAN` | **OPEN** (`UNVERIFIED`) | **P0** (capacity) | Shared infra | Hostinger support / Topology proof | Do **not** assume multi-domain = one PID; pursue fewer warm hosts (Package A/B) until merge proven | Documented PID merge **or** explicit “per-vhost spawn” ops decision + measured savings |
| **HOST-PKG-B** | Shared | Unused-host audit | **DEFERRED** | P1 | Shared infra | Product-owner OK | Retire GetPro/Netraz testing hosts only with owner approval | PID drop without breaking those teams’ QA |
| **TEST-DEBT-ISO** | Shared | `KNOWN_TEST_DEBT.md` | **OPEN** | P3 | Shared test | Per-suite DB isolation | Isolate combined-run interference | Combined website suite gate without cross-suite false fails |

### 4.2 Shared website editor / Stitch parity (current V2.01 line)

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **SP-T2** | Shared | Stitch parity action plan | **OPEN** | **P1** | Shared | SP-T1 done | Humanize Field History title + truncated value previews on choices | BB+AC sheet: label not raw `contentKey`; restore stays draft-only; 1440+390 |
| **SP-T3** | Shared | Action plan Screen 3 | **OPEN** | **P1** | Shared | — | Unpublished panel empty-state + page-group hierarchy toward `d205f226` / `33660fcf` | Open from pending pill at 0 and N>0 on BB+AC |
| **SP-T4** | Shared | Action plan Screen 2 / UIE | **OPEN** | **P2** | Shared | — | Align field-editor / Adjust Picture spacing at 390; keep D/M framing | Dialog usable at 390; no CDN rewrite |
| **SP-T5** | Shared | Action plan Screen 6 | **OPEN** | **P2** | Shared | Theme registry preserved | Richer theme card thumbnails + Preview/Select affordances | Product filter still rejects cross-product themes |
| **SP-T6** | BB (+ AC leave) | Action plan Screen 7 | **OPEN** | **P2** | Mostly BB | No studio rebuild | Card density / badge stacking on scope list | BB multi-site cards; AC still single clinic + no facility websites |
| **SP-T7** | Shared | Action plan Screen 5 | **OPEN** | **P2** | Shared | **No** Section Library column | Polish Add Section picker sheet only | Add Section draft-only; picker usable 1440/390 |
| **SP-VIS-REMINDER** | Shared | Parity audit / action plan §6 | **OPEN** (NOT SCORED) | **P2** | Shared | ≥5 pending on disposable tenant | Trigger publishing reminder live; score vs `d9f101c6` | Reminder shows when pending ≥5; dismiss/continue safe |
| **SP-VIS-PUBFAIL** | Shared | Parity audit / Final QA residual | **OPEN** (NOT SCORED) | **P2** | Shared | Safe failure injection | Capture publish-failure UX without breaking tenant | Failure copy actionable; happy-path publish still PASS |
| **AC-WE-OVERFLOW** | ActiveClinic | Toolbar parity QA residual | **OPEN** | **P2** | AC-specific chrome | Public header/nav while editing | Reduce residual horizontal overflow at 1440/390 without shrinking 44px toolbar | `scrollWidth` residual documented → 0 or accepted `PRODUCT_DECISION` |
| **THEME-PACKS-REST** | Shared | First additional themes QA | **DEFERRED** | P3 | Shared | Design packs | Remaining Stitch theme packs + palette editor | Out of V2.01 SP-* scope unless newly authorized |

### 4.3 V8 product backlog (canonical)

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **V8-001** | Shared | `V8_BACKLOG.md` | **OPEN** | **P2** | Shared | SMTP / adapter config | Real transactional email for password reset; keep capture adapter for QA | Hosted reset deliver→complete for authorized test identities |
| **V8-003** | BlessBoard | `V8_BACKLOG.md` | **OPEN** | **P3**† | BB auth | Product policy | Allow catalogue-only `website_editor` / `website_publisher` sessions without legacy companion role | Login + exact catalogue permissions; suspended/cross-tenant denied |
| **V8-002** | ActiveClinic | `V8_BACKLOG.md` | **OPEN** | **P3** | AC | Product policy | Decide org_admin ± `patient.create`; implement approved matrix | UI+API auth match policy; isolation + audit preserved |

† Catalogue-only login blocks pure website-role admins; still catalogued **P3** in canonical V8 backlog (policy + companion-role workaround exists). Escalate only if product declares website-only roles mandatory for go-live.

### 4.4 Media / content (design-gated)

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **V2-MEDIA-01** | Shared | `V2_MEDIA_BACKLOG.md` | **OPEN** | **P1** | Shared | Privacy/consent review | YouTube URL → safe embed; no binary video storage | Allow-listed URLs only; draft/preview/publish/history; deny other hosts |
| **V2-BB-SERMONS-01** | BlessBoard | Media backlog | **OPEN** (DESIGN PENDING) | P1 | BB | Design + MEDIA-01 | Sermons redesign | Design gate then hosted QA |
| **V2-BB-GIVING-01** | BlessBoard | Media backlog | **OPEN** (DESIGN PENDING) | P1 | BB | MEDIA-01 | Giving Generosity YouTube player | Same |
| **V2-BB-CONTACT-01** | BlessBoard | Media backlog | **OPEN** (DESIGN PENDING) | P1 | BB | Design | Contact video→image redesign | Design gate then hosted QA |

### 4.5 V8 visual QA ledger (non-editor; still open)

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **VQ-P0-004** | Shared announcements | Visual QA backlog | **OPEN** (**DEFERRED** Prompt 42) | P2‡ | Shared studio | Product skin decision | AN01 density uplift **or** `PRODUCT_DECISION_DIFFERENCE` | Hosted AN01 D/M vs Stitch or documented decision |
| **VQ-P0-005** | Shared announcements | Visual QA backlog | **OPEN** (**DEFERRED**) | P2‡ | Shared | AN01 shell | Member-facing AN04 preview chrome | Preview matches Stitch AN04 intent |
| **VQ-FIX-001…006** | BB / Shared forms | Visual QA backlog | **OPEN** | P1 (fixture) | Fixture | Disposable seeds / platform-admin cred | Seed empty-forms, event/ministry, transfer, branch queue; or inventory OOS | BLOCKED screens become capturable without wiping QA tenants |
| **VQ-P1-*** / **VQ-P2-*** | BB Form Studio / membership / announcements | Visual QA backlog | **OPEN** | P1–P2 | Mix | Often fixtures | Density / overflow / inspector polish per screen ID | Hosted D/M shots vs Stitch; no 84-screen PASS claim until re-audit |

‡ Originally labeled P0 FAIL in 84-screen audit; Prompt 42 explicitly **deferred as non-blocking** for manual QA readiness. Treat as visual polish, not core workflow blockers.

### 4.6 Platform POST-V1 (`docs/BACKLOG.md`)

| ID | Product | Source | Status | Severity | Shared? | Dependency | Recommended fix | Acceptance test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **AC-LOCATION-01** | Platform / AC | `docs/BACKLOG.md` | **OPEN** | P3 | Shared locations | Admin UX | Approve/merge user-added cities | Registration unblocked; audit preserved |
| **AC-LOCATION-02** | Platform | same | **OPEN** | P3 | Shared | Subdivision datasets | Southern Africa province dropdowns | Dropdown where supported; free text otherwise |
| **AC-WEBSITE-01** | Shared | same | **OPEN** | P3 | Shared | Careful cutover | Consolidate legacy website content projections | One authoritative projection per surface; publish safe |

---

## 5. Already resolved — skip (do not reopen)

| ID / claim | Status | Evidence |
| --- | --- | --- |
| **SP-T1** toolbar + History/pencil touch targets | **FIXED_VERIFIED** | `V2_01_SHARED_EDITOR_TOOLBAR_PARITY_PASS` · commits `fa0853ff`/`d2ce78f3` · tip `a901751a` |
| Shared WE01 integrated journey | **FIXED_VERIFIED** | Final QA **66/66** PASS (`c00dce00` line) |
| Final-QA P2 residuals (image crop click-through, restore POST, structured mutate) | **FIXED_VERIFIED** | P2 gap closure **48/48** PASS |
| Change Manager / unpublished / field history / reminders foundation | **FIXED_VERIFIED** | Respective `V2_01_*_PASS` reports |
| Universal Image Editor + placement + payload | **FIXED_VERIFIED** | UIE / placement / payload / P2 QA |
| Theme infra + gallery + first additional themes | **FIXED_VERIFIED** | C1–C3 QA PASS |
| HQ/branch website cards (E1) | **FIXED_VERIFIED** | HQ/branch QA PASS; studio intentionally not built |
| Section management (shared) | **FIXED_VERIFIED** | Section management PASS |
| BB inline editor parity entry chrome | **FIXED_VERIFIED** | BB inline parity PASS |
| Release Notes Center + BB/AC update | **FIXED_VERIFIED** | Auth + update QA PASS |
| Publish diagnostics / lookup root cause | **FIXED_VERIFIED** (diagnostics) | Root cause confirmed; diagnostics QA PASS; opaque remap understood |
| **V2-BB-18** Our Values `unknown_content_key` | **FIXED_VERIFIED** | Bug register + Bug 20 regression tests |
| **V2-BB-20** Contact opening hours | **FIXED_VERIFIED** | Hosted PASS `0ddee769` |
| VQ-P0-001/002/003 (BB21 list, BB13-M, BB14-M functional) | **FIXED_VERIFIED** | Prompt 42 · `ecfddf5c` |
| SH15 access-denied UI | **FIXED_VERIFIED** | Prompt 39 |
| BB03–BB06 membership wizard structural | **FIXED_VERIFIED** | Prompt 40 |
| Architecture audit “themes / crop / HQ cards NOT IMPLEMENTED” | **HISTORICAL** | Superseded by C1–C3 / UIE / E1 PASS — do not reopen as missing features |
| Stitch three-column Web Studio as target | **HISTORICAL / E** | Action plan obsolete refs — do not implement |
| V8 Phase-0 host 503 | **HISTORICAL** | Current hosts healthy on `a901751a` |
| AC facility mini-websites / network-wide publish / Section Library column | **DEFERRED** (unsupported product) | Explicit non-goals across Final QA + action plan |

### Fixed-unverified / do not treat as open P0

| ID | Status | Note |
| --- | --- | --- |
| **V1.3 BB About `data-draft` hydration Major** | **FIXED_UNVERIFIED** | Later V2.01 draft save/refresh/section/home freeform PASS strongly suggest resolution; **About-specific chrome attribute** not re-probed in V2.01 reports — optional smoke only, do not reopen from V1.3 alone |

---

## 6. Duplicate / stale backlog entries

| Entry | Classification | Keep / skip |
| --- | --- | --- |
| Architecture §D/E “crop / themes NOT IMPLEMENTED” | **STALE** vs UIE/theme QA | Skip as open work; keep for history |
| Parity audit scoring vs studio `f8176aec` / HQ studio `af7bebae` | **STALE / E** | Use action-plan final refs |
| Final QA “NOT TESTED” image/restore/structured rows | **DUPLICATE** of closed P2 gap closure | Skip |
| `docs/BACKLOG 2.md` and other `* 2.md` duplicates | **DUPLICATE** file copies | Ignore; prefer non-`2` paths |
| VQ-P0-001–003 still listed as FAIL in older overnight docs | **STALE** | Closed Prompt 42 |
| Media backlog sermons/giving depending on YouTube | **DEPENDENCY** not duplicate | Sequence after **V2-MEDIA-01** |
| SP-T1 gaps restated in action plan | **DUPLICATE** of toolbar PASS | Skip |

---

## 7. Infrastructure vs product tasks

| Track | Items |
| --- | --- |
| **Infrastructure / Hostinger** | HOST-PKG-A, HOST-CONSOL, HOST-PKG-B, TEST-DEBT-ISO |
| **Shared product (website editor)** | SP-T2…SP-T7, SP-VIS-*, V2-MEDIA-01, THEME-PACKS-REST, AC-WEBSITE-01 |
| **BlessBoard-specific** | V8-003, V2-BB-SERMONS/GIVING/CONTACT, VQ membership/announcements PARTIALs, SP-T6 BB density |
| **ActiveClinic-specific** | V8-002, AC-WE-OVERFLOW, AC location backlog |
| **Shared non-editor product** | V8-001 email, VQ announcement studio AN01/AN04, Form Studio visual PARTIALs, VQ fixtures |

---

## 8. Release blockers and dependencies

### Release blockers (current tip)

| Claim | Assessment |
| --- | --- |
| Shared editor draft→preview→publish core | **Not blocked** — Final QA + P2 + toolbar PASS |
| Promote V8 testing → production | **Blocked by policy / readiness** — all V2.01 reports say **do not promote**; production remains `03a89106e2fe` |
| Account NPROC / warm www workers | **Ops P0** — does not fail app journeys but can threaten Hostinger capacity; **HOST-PKG-A blocked** without hPanel |
| Website-only catalogue login | **Product policy** — not a proven crash; companion legacy role workaround documented |
| Transactional email | **P2** — resets via capture in QA; live SMTP incomplete |
| 84-screen visual PASS | **Not a release claim** — PARTIALs/fixtures remain; Prompt 42 was `V8_READY_FOR_MANUAL_QA` without 84/84 PASS |

### Critical dependencies

```
HOST-PKG-A ──(ops)──► measured PID relief ──► optional HOST-CONSOL experiments
SP-T1 (done) ──► SP-T2 ──► SP-T3 ──► SP-T4…T7 (visual polish; independent enough to ship separately)
V2-MEDIA-01 ──► V2-BB-SERMONS-01 / GIVING-01
VQ-FIX-* ──► meaningful VQ-P1 visual re-scores for BB09/10/11/16 / SH02/14
V8-002 / V8-003 ──► product policy decisions before code
```

---

## 9. Overnight execution order (recommended)

**Ops track (parallel, human-gated):**

1. Operator: **HOST-PKG-A** www unbind + redirect (re-open Package A QA).  
2. Record PID matrix; only then consider Package B / consolidation experiments.

**App track (V8 testing only, disposable tenants):**

1. **SP-T2** Field History labels + value preview.  
2. **SP-T3** Unpublished Changes panel hierarchy/empty state.  
3. **SP-T4** Dialog / Adjust Picture densification at 390.  
4. **SP-VIS-REMINDER** (≥5 pending) + **SP-VIS-PUBFAIL** (safe failure path).  
5. **SP-T5** → **SP-T6** → **SP-T7** gallery/cards/Add Section polish.  
6. Optional: **AC-WE-OVERFLOW** public chrome while editing.  
7. If authorized: **V2-MEDIA-01** privacy review kickoff (design), not full sermons redesign.  
8. Fixture seeds (**VQ-FIX-***) only if overnight visual re-score is in scope.  
9. **Do not** touch production; **do not** rebuild Web Studio / Section Library / AC facilities.

**Explicit skip overnight:** V8-001 SMTP (needs credentials), V8-002/003 (policy), remaining theme packs, AN01/AN04 deep redesign, full 84-screen re-audit unless scheduled.

---

## 10. Top 15 current open tasks

| # | ID | Severity | One-line |
| --- | ---: | --- | --- |
| 1 | **HOST-PKG-A** | P0 | Unbind www Node workers (ops-blocked) |
| 2 | **HOST-CONSOL** | P0 | Prove or abandon single-PID multi-host merge |
| 3 | **SP-T2** | P1 | Field History human labels + value preview |
| 4 | **SP-T3** | P1 | Unpublished Changes panel hierarchy |
| 5 | **V2-MEDIA-01** | P1 | YouTube-only video embeds (shared) |
| 6 | **VQ-FIX-001…006** | P1 | Visual QA fixture/credential unblockers |
| 7 | **SP-T4** | P2 | Field/image dialog densify at 390 |
| 8 | **SP-VIS-REMINDER** | P2 | Live ≥5 publishing reminder score |
| 9 | **SP-VIS-PUBFAIL** | P2 | Publish failure UX visual score |
| 10 | **SP-T5** | P2 | Theme gallery card affordances |
| 11 | **SP-T6** | P2 | BB HQ/branch card density |
| 12 | **SP-T7** | P2 | Add Section picker polish (no library column) |
| 13 | **V8-001** | P2 | Transactional email delivery |
| 14 | **VQ-P0-004 / VQ-P0-005** | P2 | AN01/AN04 deferred visual polish |
| 15 | **AC-WE-OVERFLOW** | P2 | AC residual horizontal overflow in edit mode |

*Honorable next (P3 / design):* **V8-003**, **V8-002**, **V2-BB-SERMONS-01**, **THEME-PACKS-REST**, **AC-LOCATION-01/02**, **AC-WEBSITE-01**.

---

## 11. Production untouched confirmation

| Check | Result |
| --- | --- |
| `blessboard.com` `/healthz` | `03a89106e2fe` · `moovex-platform-production` |
| This audit | Docs only — **no** deploy, migrate, process kill, or production write |

---

## FINAL VERDICT (repeat)

**`V2_01_MASTER_BACKLOG_AUDIT_COMPLETE`**
