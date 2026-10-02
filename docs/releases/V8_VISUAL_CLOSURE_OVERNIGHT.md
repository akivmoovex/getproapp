# V8 Visual Closure — Overnight Baseline

**Prompt:** 38  
**Verdict:** `V8_VISUAL_CLOSURE_BASELINE_READY`  
**Date:** 2026-09-21  
**Last update:** 2026-09-21 (Prompt **41** — visual QA backlog saved)  
**Branch:** `V8` only (`origin/V8` up to date)  
**Source tip SHA (baseline):** `bd2916bd3141c30567f8571325babe16c3938102`  
**Hosted application SHA (baseline audit):** `bd2916bd3141`  
**Hosted tip at Prompt 41 doc write:** check live `/healthz` (code prompts 39–40 deployed beyond baseline)  
**Hosted deployment:** `moovex-platform-v8-testing` · `schemaCompatible=true` · `platformLine=v8` · `environment=testing`  
**Hosts checked:** `neuniversity.org` · `blessboard.neuniversity.org` · `activeclinic.neuniversity.org`  
**Stitch project:** [projects/5087412725796049014](https://stitch.withgoogle.com/projects/5087412725796049014) — *BlessBoard Membership Registration Workflow*  
**Source report:** [`V8_HOSTED_84_SCREEN_VISUAL_AUDIT.md`](./V8_HOSTED_84_SCREEN_VISUAL_AUDIT.md) (Prompt 37 reconciled classifications)  
**Visual QA backlog:** [`docs/backlog/V8_V2_VISUAL_QA_BACKLOG.md`](../backlog/V8_V2_VISUAL_QA_BACKLOG.md)  
**Viewports:** Desktop **1440×900**, Mobile **390×844**  
**Tenant:** disposable V8 QA only — `bb-v8qa-mub23a6v6a6b`

Local tip **matched** hosted at Prompt 38 baseline. Classifications in the scoreboard below are the **final reconciled** Prompt 37 totals — not earlier scorer-only sums.

---

## Prompt 41 update — work completed & remaining

### Work completed (Prompts 39–40)

| Prompt | Outcome | Hosted SHA verified | Visual audit impact |
|--------|---------|---------------------|---------------------|
| **39** Shared Forms P0 | Create→Edit→Publish→Share→Submit→Review + **SH15** access-denied UI | `3946db34e639` | Closes audit **SH15-D/M FAIL** (functional). Form Studio density PARTIALs remain. |
| **40** Membership wizard | Four-step BB03–BB06 + BB07 confirmation on path-public register | `37cd39a3ba18` | Closes audit **BB03–BB06 FAIL** (structural wizard). BB07/BB08 visual PARTIAL polish remains. |
| **41** Visual QA backlog | Catalogued all unresolved defects | docs only | No UI changes; no deploy; no hosted data writes |

### Remaining counts

| Scope | PASS | PARTIAL | FAIL | BLOCKED | Notes |
|-------|-----:|--------:|-----:|--------:|-------|
| **Prompt 37 baseline (locked)** | 2 | 56 | 18 | 8 | Full 84-screen hosted visual reconcile — still the only complete count |
| **After 39–40 (ledger, not re-score)** | 2 | 56 | **8 open** | 8 | FAIL closed functionally: SH15×2 + BB03–BB06×8 = 10. Remaining FAIL: BB13-M, BB14-M, BB21×2, AN01×2, AN04×2 |
| **Full visual re-score** | — | — | — | — | **Not run** — do not claim new PASS totals from source alone |

Preserve **SH10-D/M** PASS.

### Backlog location

[`docs/backlog/V8_V2_VISUAL_QA_BACKLOG.md`](../backlog/V8_V2_VISUAL_QA_BACKLOG.md)

### Next recommended task

1. **BB21-D/M** — path-public announcements list 404 (P0 journey).  
2. **BB13-M / BB14-M** — mobile overlap FAILs.  
3. Fixture unblockers: BB09/BB10 event+ministry; SH02 empty forms; SH14 platform-admin credential.

---

## Initial 84-screen status

| Result | Count | Rule for overnight |
|--------|------:|--------------------|
| **PASS** | **2** | **Preserve** — do not regress SH10-D / SH10-M |
| **PARTIAL** | **56** | Repair toward Stitch intent; re-verify hosted |
| **FAIL** | **18** | Must close or reclassify with explicit product decision + re-baseline |
| **BLOCKED** | **8** | Unblock with disposable fixtures/credentials (no wipe of overnight QA artifacts) |
| **Total** | **84** | |

| Family | PASS | PARTIAL | FAIL | BLOCKED |
|--------|-----:|--------:|-----:|--------:|
| SH01–SH15 (× D/M) | 2 | 22 | 2 | 4 |
| BB01–BB22 (× D/M) | 0 | 34 | 10 | 4 |
| AN01–AN05 (× D/M) | 0 | 6 | 4 | 0 |

Evidence roots (local, not committed): `/tmp/v8-visual-audit/{shots,stitch,visual-scores.json,capture-results.json}`.

---

## Operating rules (Prompts 39–45)

1. Work **exclusively on `V8`**. Do not modify V7 or production.
2. Reuse approved Stitch designs from `projects/5087412725796049014`.
3. Implement / verify **desktop 1440px** and **mobile 390px**.
4. Fix **shared defects at platform level** when the same component drives multiple screen failures.
5. Do **not** replace functional UI with static mockups.
6. Preserve tenant, church, branch, and role permissions.
7. Use **only disposable V8 QA data** for hosted write tests.
8. Do **not** apply migrations, reset data, or send real messages.
9. Add tests for modified code paths; run relevant regression suites.
10. Commit and push completed fixes **exclusively to `V8`**.
11. Verify the **actual hosted SHA** before claiming hosted PASS; if V8 auto-deploys, record the new hosted SHA.
12. **Never** claim visual PASS from source inspection alone.

---

## Preserve — already PASS (2)

| Code | Defect | Evidence | Prompt |
|------|--------|----------|--------|
| **SH10-D** | None — thanks confirmation hierarchy matches Stitch intent | shot + stitch; SH scorer PASS | **Preserve** (regression guard in 42/45) |
| **SH10-M** | None — mobile thank-you structurally correct | shot + stitch; SH scorer PASS | **Preserve** (regression guard in 42/45) |

Do not restyle SH10 chrome in ways that break received / thank-you / reference hierarchy.

---

## Shared components driving multiple defects

Fix these once at platform / shared-skin level; then re-check all listed screens.

| Shared component | Defect pattern | Screens impacted | Owner prompt |
|------------------|----------------|------------------|--------------|
| **Form Studio shell** (Moovex enterprise Stitch vs thinner BB allowlisted builder) | Missing KPI cards, filters, HIPAA rails, dense chrome | SH01, SH03–SH08, SH11–SH13 (PARTIAL); product decision may also affect SH14/SH15 framing | **42** (+ decision gate in **45**) |
| **Form Studio mobile sticky / overflow** | Control overlap, tab truncation, horizontal overflow | SH07-M, SH11-M (PARTIAL) | **42** |
| **Form Studio panel / workflow states** | Inspector / status-transition states not shown as designed | SH04, SH13 (PARTIAL) | **42** |
| **Unauthorized Form Studio render** | Plain-text site deny instead of `access-denied.ejs` | SH15-D/M (FAIL) | **42** |
| **Announcement Studio shell** | Missing KPI / filters / multi-status density; thin admin chrome | AN01 (FAIL); AN02, AN03, AN05 (PARTIAL) | **44** |
| **Announcement preview chrome** | Admin plain-text panel vs member-facing bulletin/hero preview | AN04-D/M (FAIL) | **44** |
| **Public membership register** | Single-page form vs Stitch 4-step wizard | BB03–BB06 (FAIL ×8); BB07 confirmation chrome (PARTIAL) | **40** |
| **BB HQ sticky header / action bar (mobile)** | Floating header / sticky actions overlap content | BB13-M, BB14-M (FAIL); watch BB18-M chip row | **41** |
| **Path-public announcements index** | List route 404; detail-only works | BB21-D/M (FAIL); BB22 detail polish (PARTIAL) | **43** |
| **Activity registration fixtures** | No published event/ministry UUIDs on disposable tenant | BB09, BB10 (BLOCKED ×4) | **39** |
| **Forms empty-state / platform-admin fixtures** | Cannot reach empty Forms Mgmt; `/admin/forms` 403 for HQ | SH02, SH14 (BLOCKED ×4) | **39** |
| **Membership transfer + branch queue data** | No open transfer record; branch queue empty vs HQ | BB16 (PARTIAL high); BB11 (PARTIAL) | **39** (data) + **41** (UI) |

---

## Prompt task map (39–45)

| Prompt | Title | Primary outcome | Screen IDs |
|--------|-------|-----------------|------------|
| **39** | Unblock fixtures & credentials | Clear all **8 BLOCKED**; seed transfer/queue samples needed by later prompts | SH02-D/M, SH14-D/M, BB09-D/M, BB10-D/M (+ data for BB11, BB16) |
| **40** | Membership registration wizard | Close **BB03–BB06 FAIL**; lift BB07/BB08 PARTIAL | BB03–BB08 (−D/−M) |
| **41** | Membership admin / directory / mobile layout | Close **BB13-M / BB14-M FAIL**; lift membership admin PARTIAL | BB01–BB02, BB11–BB18 (−D/−M) |
| **42** | Shared Form Studio + access denied | Close **SH15 FAIL**; lift Form Studio PARTIAL; preserve SH10 | SH01, SH03–SH09, SH11–SH13, SH15 (−D/−M); guard SH10 |
| **43** | BB announcements public + HQ polish | Close **BB21 FAIL**; lift BB19–BB20 / BB22 PARTIAL | BB19–BB22 (−D/−M) |
| **44** | Shared Announcement Studio | Close **AN01 / AN04 FAIL**; lift AN02 / AN03 / AN05 PARTIAL | AN01–AN05 (−D/−M) |
| **45** | Product decisions + hosted re-audit | Resolve chrome `PRODUCT_DECISION_DIFFERENCE` leftovers; re-score all **84** on live hosted SHA | All 84; any residual PARTIAL after 39–44 |

---

## BLOCKED screens (8) → Prompt 39

| Code | Exact defect | Evidence | Repair plan | Prompt |
|------|--------------|----------|-------------|--------|
| **SH02-D** | Empty Forms Management state requires **zero** forms; disposable tenant already has forms | No empty-tenant hosted UI; cannot wipe without destroying overnight QA artifacts | Seed **isolated empty-forms fixture org** or feature-flag empty-state preview route for QA; capture empty Stitch state without deleting existing forms | **39** |
| **SH02-M** | Same as SH02-D (mobile) | Same | Same as SH02-D at 390px | **39** |
| **SH14-D** | Platform cross-tenant forms overview `/admin/forms` returns **403 Unavailable** for disposable HQ | Hosted 403; no platform-admin credential in `.env.v8-qa-tenants.local` | Add disposable **platform-admin** QA identity **or** document SH14 out-of-scope for tenant QA with inventory re-baseline | **39** |
| **SH14-M** | Same as SH14-D (mobile) | Same | Same as SH14-D at 390px | **39** |
| **BB09-D** | Public event registration needs published `blessboard.events` UUID; none discoverable | No event resource on disposable tenant | Seed disposable **published event** (+ activity admin `event_id`); record fixture ID for harness | **39** |
| **BB09-M** | Same as BB09-D (mobile) | Same | Same + mobile capture | **39** |
| **BB10-D** | Public ministry registration needs published `blessboard.ministries` UUID | No ministry resource on disposable tenant | Seed disposable **published ministry**; record fixture ID | **39** |
| **BB10-M** | Same as BB10-D (mobile) | Same | Same + mobile capture | **39** |

**Prompt 39 also seeds (not BLOCKED, but blocks visual completeness):**

| Data need | Screens unblocked for later UI work |
|-----------|-------------------------------------|
| Open membership **transfer** record + stable `/hq/membership/transfers/:id` | BB16-D/M |
| Campus A **pending** registrations in branch queue | BB11-D/M |

---

## FAIL screens (18) — by prompt

### Prompt 40 — Membership wizard (8)

| Code | Exact defect | Evidence | Repair plan |
|------|--------------|----------|-------------|
| **BB03-D** | Stitch Step 1 (Personal) — hosted `/c/:org/register` is **single-page** with all sections | shot + stitch; wizard steps not attainable | Implement Stitch **4-step wizard** + progress stepper (Personal → Spiritual → Interests → Review) **or** explicit `PRODUCT_DECISION_DIFFERENCE` + inventory re-baseline to one page |
| **BB03-M** | Same (mobile) | Same | Mobile stepper + stacked fields per Stitch BB03-M |
| **BB04-D** | No Step 2 (Spiritual) UI | Discrete step screenshot unattainable | Same wizard decision / implementation |
| **BB04-M** | Same (mobile) | Same | Same |
| **BB05-D** | No Step 3 (Interests) UI | Same | Same |
| **BB05-M** | Same (mobile) | Same | Same |
| **BB06-D** | No Step 4 (Review) UI | Same | Same |
| **BB06-M** | Same (mobile) | Same | Same |

### Prompt 41 — Mobile membership breakage (2)

| Code | Exact defect | Evidence | Repair plan |
|------|--------------|----------|-------------|
| **BB13-M** | Floating header overlaps subtitle/content; decision UI (approve / follow-up / decline) absent | BB scorer FAIL; shot + stitch | Fix mobile sticky header stacking; expose decision controls without overlap |
| **BB14-M** | Save / transfer buttons overlap form fields — severe mobile layout break | BB scorer FAIL; shot + stitch | Fix sticky action bar / field stacking on member profile mobile |

### Prompt 42 — Form Studio access denied (2)

| Code | Exact defect | Evidence | Repair plan |
|------|--------------|----------|-------------|
| **SH15-D** | Branch→HQ Form Studio returns plain HTML *“You do not have access to this site.”* — not `views/platform/forms/access-denied.ejs` | Hosted plain-text deny; designed SH15 not rendered | Route unauthorized Form Studio viewers through `access-denied` render; add disposable role without form-manage for QA |
| **SH15-M** | Same (mobile) | Same | Same at 390px |

### Prompt 43 — Public announcements list (2)

| Code | Exact defect | Evidence | Repair plan |
|------|--------------|----------|-------------|
| **BB21-D** | Public announcements **list** `/c/:org/announcements` returns **404**; only detail works | Hosted 404 on list; detail captured | Wire path-public announcements **index** to public list view matching Stitch BB21 |
| **BB21-M** | Same (mobile) | Same | Same at 390px |

### Prompt 44 — Announcement Studio critical (4)

| Code | Exact defect | Evidence | Repair plan |
|------|--------------|----------|-------------|
| **AN01-D** | Dashboard missing Stitch KPI cards, filters, shell, multi-status table | AN scorer FAIL; shot + stitch | Uplift AN01 to Stitch density **or** product-skin decision documented in Prompt 45 |
| **AN01-M** | Same (mobile) | Same | Same |
| **AN04-D** | Preview is admin plain-text panel, not member-facing bulletin/hero preview | AN scorer **critical** FAIL; shot + stitch | Render audience-facing preview chrome / explicit PREVIEW MODE frame matching Stitch |
| **AN04-M** | Same (mobile) | Same | Same |

---

## PARTIAL screens (56) — by prompt

### Prompt 40 — Public registration confirmation / visitor (4)

| Code | Severity | Exact defect | Evidence | Repair plan |
|------|----------|--------------|----------|-------------|
| **BB07-D** | low | Submitted confirmation works; Stitch journey chrome richer | shot + stitch | Align confirmation hierarchy with wizard completion (after BB03–BB06 decision) |
| **BB07-M** | low | Same (mobile) | shot + stitch | Same |
| **BB08-D** | medium | Visitor public form thinner than Stitch BB08 | shot + stitch | Align visitor public layout to Stitch BB08 |
| **BB08-M** | medium | Same (mobile) | shot + stitch | Same |

### Prompt 41 — Membership admin / directory (22)

| Code | Severity | Exact defect | Evidence | Repair plan |
|------|----------|--------------|----------|-------------|
| **BB01-D/M** | medium | Membership forms admin thinner vs Stitch | shot + stitch | Spacing/typography/card density toward Stitch |
| **BB02-D/M** | medium | Membership form detail thinner vs Stitch | shot + stitch | Same |
| **BB11-D/M** | medium | Branch queue empty (0) while HQ has registrations — triage density gap | shot + stitch | Confirm branch scoping + use Prompt 39 pending samples; match Stitch queue density |
| **BB12-D/M** | medium | Registration detail thinner vs Stitch | shot + stitch | Density / decision chrome polish |
| **BB13-D** | medium | Desktop registration decision usable but thinner | shot + stitch | Close remaining desktop density gaps (mobile FAIL owned above) |
| **BB14-D** | medium | Desktop member profile thinner; actions OK | shot + stitch | Density polish (mobile FAIL owned above) |
| **BB15-D/M** | medium | Member edit thinner vs Stitch | shot + stitch | Field grouping / sticky actions per Stitch |
| **BB16-D/M** | **high** | No open transfer; capture fell back to member profile | shot + stitch (wrong state) | Use Prompt 39 transfer fixture; render dedicated transfer screen |
| **BB17-D/M** | medium | HQ members directory thinner vs Stitch | shot + stitch | Table/filter density |
| **BB18-D/M** | medium | Branch members overview thinner; **BB18-M** status chip truncation | shot + stitch | Density + wrap/scroll chips at 390px |

### Prompt 42 — Shared Form Studio (22 PARTIAL + SH10 guard)

| Code | Severity | Exact defect | Evidence | Repair plan |
|------|----------|--------------|----------|-------------|
| **SH01-D/M** | high | Form Studio home missing Moovex/Stitch KPI/filter chrome | shot + stitch | Platform-level Form Studio skin uplift **or** defer chrome to Prompt 45 `PRODUCT_DECISION_DIFFERENCE` |
| **SH03-D/M** | medium | Studio builder thinner / sparse mobile | shot + stitch | Builder chrome + mobile density |
| **SH04-D/M** | high | Field-settings inspector not captured as Stitch state | shot + stitch; SH scorer notes | Target inspector panel state in harness + UI |
| **SH05-D/M** | medium | Preview secondary panels missing vs Stitch | shot + stitch | Restore preview chrome panels |
| **SH06-D/M** | medium | Publication panels thinner vs Stitch | shot + stitch | Publication secondary UI |
| **SH07-D** | medium | Sharing panels thinner vs Stitch | shot + stitch | Sharing secondary UI |
| **SH07-M** | **high** | Save sharing settings overlaps access-tier controls | shot + stitch; SH scorer | Fix mobile sticky save vs tier controls |
| **SH08-D/M** | medium | Public form thinner vs Stitch | shot + stitch | Public form chrome (preserve consent) |
| **SH09-D/M** | low | Validation banner works; Stitch journey chrome richer | shot + stitch | Minor validation chrome polish |
| **SH11-D** | medium | Submissions list secondary panels missing | shot + stitch | List chrome densification |
| **SH11-M** | medium | Tab truncation / thinner list; harness overflowX watch | shot + stitch; overflow note | Fix 390px tab row / overflow |
| **SH12-D/M** | medium | Submission detail thinner vs Stitch | shot + stitch | Detail chrome |
| **SH13-D/M** | **high** | Wrong workflow state vs Stitch status-transition | shot + stitch; SH scorer | Target review-commit / status UI state |

### Prompt 43 — BB announcements HQ + public detail (6)

| Code | Severity | Exact defect | Evidence | Repair plan |
|------|----------|--------------|----------|-------------|
| **BB19-D/M** | medium | HQ announcements list thinner vs Stitch | shot + stitch | Admin list density |
| **BB20-D/M** | medium | HQ announcement edit thinner vs Stitch | shot + stitch | Admin form polish |
| **BB22-D/M** | low | Public detail readable; article chrome simpler than Stitch | shot + stitch | Article chrome after BB21 list exists |

### Prompt 44 — Announcement Studio non-FAIL (6)

| Code | Severity | Exact defect | Evidence | Repair plan |
|------|----------|--------------|----------|-------------|
| **AN02-D/M** | high | Editor exists; major density gap vs Stitch | AN scorer PARTIAL major; shot + stitch | Editor shell uplift with AN01 shared chrome |
| **AN03-D/M** | high | Schedule exists; major density gap vs Stitch | AN scorer PARTIAL major; shot + stitch | Schedule chrome uplift |
| **AN05-D/M** | high | Confirm-publish exists; major density gap vs Stitch | AN scorer PARTIAL major; shot + stitch | Confirm-publish chrome uplift |

### Prompt 45 — Residual decisions & closure

| Item | Scope |
|------|--------|
| Form Studio / Announcement Studio **Moovex chrome vs product skin** | Accept remaining structural gaps as `PRODUCT_DECISION_DIFFERENCE` **or** schedule further uplift; record in inventory |
| SH14 scope if Prompt 39 chooses out-of-scope | Inventory re-baseline note |
| BB03–BB06 if Prompt 40 chooses single-page | Inventory re-baseline note |
| **Hosted re-audit of all 84** | Playwright + Stitch compare on **live** `/healthz` SHA; update counts; never PASS from source alone |
| Regression guard | Confirm **SH10-D/M** still PASS |

---

## Full 84-screen assignment board

| Code | Result | Severity | Prompt | Defect (one-line) |
|------|--------|----------|--------|-------------------|
| SH01-D | PARTIAL | high | **42** | Form Studio home chrome gap vs Stitch |
| SH01-M | PARTIAL | high | **42** | Same (mobile) |
| SH02-D | BLOCKED | medium | **39** | Empty-state needs zero forms |
| SH02-M | BLOCKED | medium | **39** | Same (mobile) |
| SH03-D | PARTIAL | medium | **42** | Builder thinner vs Stitch |
| SH03-M | PARTIAL | medium | **42** | Sparse mobile builder |
| SH04-D | PARTIAL | high | **42** | Field-settings inspector state missing |
| SH04-M | PARTIAL | high | **42** | Same (mobile) |
| SH05-D | PARTIAL | medium | **42** | Preview panels thin |
| SH05-M | PARTIAL | medium | **42** | Same (mobile) |
| SH06-D | PARTIAL | medium | **42** | Publication panels thin |
| SH06-M | PARTIAL | medium | **42** | Same (mobile) |
| SH07-D | PARTIAL | medium | **42** | Sharing panels thin |
| SH07-M | PARTIAL | high | **42** | Save overlaps access-tier controls |
| SH08-D | PARTIAL | medium | **42** | Public form chrome thin |
| SH08-M | PARTIAL | medium | **42** | Same (mobile) |
| SH09-D | PARTIAL | low | **42** | Validation chrome minor |
| SH09-M | PARTIAL | low | **42** | Same (mobile) |
| SH10-D | PASS | low | **Preserve** | Thanks hierarchy OK |
| SH10-M | PASS | low | **Preserve** | Thanks hierarchy OK |
| SH11-D | PARTIAL | medium | **42** | Submissions list thin |
| SH11-M | PARTIAL | medium | **42** | Tab truncate / overflow watch |
| SH12-D | PARTIAL | medium | **42** | Submission detail thin |
| SH12-M | PARTIAL | medium | **42** | Same (mobile) |
| SH13-D | PARTIAL | high | **42** | Wrong status-transition state |
| SH13-M | PARTIAL | high | **42** | Same (mobile) |
| SH14-D | BLOCKED | high | **39** | `/admin/forms` 403 for HQ |
| SH14-M | BLOCKED | high | **39** | Same (mobile) |
| SH15-D | FAIL→CLOSED | high | **39** | Closed Prompt 39 hosted; visual re-score pending |
| SH15-M | FAIL→CLOSED | high | **39** | Closed Prompt 39 hosted; visual re-score pending |
| BB01-D | PARTIAL | medium | **41** | Membership forms admin density |
| BB01-M | PARTIAL | medium | **41** | Same (mobile) |
| BB02-D | PARTIAL | medium | **41** | Form detail density |
| BB02-M | PARTIAL | medium | **41** | Same (mobile) |
| BB03-D | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB03-M | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB04-D | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB04-M | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB05-D | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB05-M | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB06-D | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB06-M | FAIL→CLOSED | high | **40** | Closed Prompt 40 wizard; visual re-score pending |
| BB07-D | PARTIAL | low | **40** | Submitted chrome thinner |
| BB07-M | PARTIAL | low | **40** | Same (mobile) |
| BB08-D | PARTIAL | medium | **40** | Visitor form layout gap |
| BB08-M | PARTIAL | medium | **40** | Same (mobile) |
| BB09-D | BLOCKED | high | **39** | No published event id |
| BB09-M | BLOCKED | high | **39** | Same (mobile) |
| BB10-D | BLOCKED | high | **39** | No published ministry id |
| BB10-M | BLOCKED | high | **39** | Same (mobile) |
| BB11-D | PARTIAL | medium | **41** | Branch queue empty / density |
| BB11-M | PARTIAL | medium | **41** | Same (mobile) |
| BB12-D | PARTIAL | medium | **41** | Registration detail density |
| BB12-M | PARTIAL | medium | **41** | Same (mobile) |
| BB13-D | PARTIAL | medium | **41** | Desktop decision chrome thin |
| BB13-M | FAIL | high | **41** | Header overlap; decision UI absent |
| BB14-D | PARTIAL | medium | **41** | Desktop profile density |
| BB14-M | FAIL | high | **41** | Save/transfer overlap fields |
| BB15-D | PARTIAL | medium | **41** | Edit form density |
| BB15-M | PARTIAL | medium | **41** | Same (mobile) |
| BB16-D | PARTIAL | high | **41** | No transfer record / wrong state |
| BB16-M | PARTIAL | high | **41** | Same (mobile) |
| BB17-D | PARTIAL | medium | **41** | HQ directory density |
| BB17-M | PARTIAL | medium | **41** | Same (mobile) |
| BB18-D | PARTIAL | medium | **41** | Branch overview density |
| BB18-M | PARTIAL | medium | **41** | Chip truncation |
| BB19-D | PARTIAL | medium | **43** | HQ announcements list density |
| BB19-M | PARTIAL | medium | **43** | Same (mobile) |
| BB20-D | PARTIAL | medium | **43** | HQ edit form density |
| BB20-M | PARTIAL | medium | **43** | Same (mobile) |
| BB21-D | FAIL | high | **43** | Public list route 404 |
| BB21-M | FAIL | high | **43** | Same (mobile) |
| BB22-D | PARTIAL | low | **43** | Public detail chrome thin |
| BB22-M | PARTIAL | low | **43** | Same (mobile) |
| AN01-D | FAIL | high | **44** | Dashboard KPI/filter/shell missing |
| AN01-M | FAIL | high | **44** | Same (mobile) |
| AN02-D | PARTIAL | high | **44** | Editor density major gap |
| AN02-M | PARTIAL | high | **44** | Same (mobile) |
| AN03-D | PARTIAL | high | **44** | Schedule density major gap |
| AN03-M | PARTIAL | high | **44** | Same (mobile) |
| AN04-D | FAIL | high | **44** | Preview not audience-facing |
| AN04-M | FAIL | high | **44** | Same (mobile) |
| AN05-D | PARTIAL | high | **44** | Confirm-publish density major gap |
| AN05-M | PARTIAL | high | **44** | Same (mobile) |

**Assignment check:** PASS 2 + PARTIAL 56 + FAIL 18 + BLOCKED 8 = **84**. Every non-PASS ID is assigned to exactly one of Prompts **39–45** (SH10 preserved).

---

## Suggested execution order

1. **39** — Unblock fixtures/credentials (enables BB09/BB10/SH02/SH14 captures; feeds BB11/BB16).  
2. **40** — Membership wizard (largest structural FAIL family).  
3. **41** — Mobile layout FAIL + membership admin PARTIAL.  
4. **42** — Form Studio FAIL/PARTIAL (preserve SH10).  
5. **43** — BB21 list route + announcements polish.  
6. **44** — Announcement Studio FAIL/PARTIAL.  
7. **45** — Product decisions + **hosted** 84-screen re-audit on live SHA.

---

## Verification contract (every repair prompt)

- Capture hosted screenshots at **1440** and **390** after deploy.  
- Compare to Stitch `screenshot.downloadUrl` for the screen code.  
- Record `/healthz` `gitSha` in the prompt report; must match the SHA under test.  
- Update this file’s status table only when hosted visual evidence changes a classification.  
- Source-only review → **not** PASS.

---

## Final verdict

**`V8_VISUAL_CLOSURE_BASELINE_READY`** (Prompt 38)

Initial status locked: **PASS 2 / PARTIAL 56 / FAIL 18 / BLOCKED 8** (total **84**). Source SHA `bd2916bd3141c30567f8571325babe16c3938102` = hosted `bd2916bd3141`. Screen-by-screen repair plan mapped to Prompts **39–45**; SH10-D/M preserved.

**Prompt 41:** Visual QA backlog saved at [`docs/backlog/V8_V2_VISUAL_QA_BACKLOG.md`](../backlog/V8_V2_VISUAL_QA_BACKLOG.md). No full 84-screen re-score; open FAIL ledger after 39–40 = **8** app FAILs + **8** fixture BLOCKED (see Prompt 41 update above).
