# V8 V2 Visual QA Backlog

**Prompt:** 41  
**Created:** 2026-09-21  
**Branch:** `V8` only  
**Source audit:** [`docs/releases/V8_HOSTED_84_SCREEN_VISUAL_AUDIT.md`](../releases/V8_HOSTED_84_SCREEN_VISUAL_AUDIT.md) (Prompt 37 reconciled)  
**Overnight baseline:** [`docs/releases/V8_VISUAL_CLOSURE_OVERNIGHT.md`](../releases/V8_VISUAL_CLOSURE_OVERNIGHT.md) (Prompt 38)  
**Stitch:** [projects/5087412725796049014](https://stitch.withgoogle.com/projects/5087412725796049014)  
**Audit hosted SHA:** `bd2916bd3141`  
**Viewports:** Desktop **1440×900**, Mobile **390×844**

This file records **unresolved** visual / journey defects after Prompts **39–40**.  
Do **not** delete or rewrite existing entries when appending later prompt work — add dated updates below each item or in the changelog.

---

## Closure ledger (Prompts 39–40)

| Screen IDs | Audit result | Closed by | Hosted evidence SHA | Notes |
|------------|--------------|-----------|---------------------|-------|
| **SH15-D / SH15-M** | FAIL — plain-text deny ≠ `access-denied.ejs` | Prompt **39** | `3946db34e639` | Functional + HTML SH15 markers verified; **not** a full Stitch visual re-score |
| **BB03-D/M – BB06-D/M** | FAIL — single-page vs 4-step wizard | Prompt **40** | `37cd39a3ba18` | Structural wizard journey verified on path-public register; **not** a full Stitch visual re-score of each step viewport |
| Shared forms create→share→submit→review | Prior hosted journey gap (Prompt 35/37 context) | Prompt **39** | `3946db34e639` | Functional P0 journey; Form Studio Stitch density PARTIALs remain open below |

**Still PASS (unchanged, preserve):** SH10-D / SH10-M (Prompt 37).

**Not closed by 39–40:** all BLOCKED fixtures; remaining FAIL/PARTIAL listed below; BB07/BB08 visual PARTIAL polish.

---

## Priority summary

| Priority | Focus |
|----------|--------|
| **P0** | Broken primary journeys / auth-adjacent open FAILs from audit |
| **P1** | Mobile layout breakage, membership admin, announcements, studio density, fixtures |
| **P2** | Spacing, typography, card density, minor chrome |

---

## A. Fixture / environment blockers (separate from app defects)

These are **BLOCKED** in the reconciled audit because disposable QA fixtures or credentials are missing — not because the designed UI was proven wrong on a reachable route.

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-FIX-001 | **SH02-D / SH02-M** | Empty Forms Management state requires zero forms; disposable tenant already has forms. Cannot wipe without destroying overnight QA artifacts. | medium | Isolated empty-forms fixture org **or** empty-state preview route; do not delete existing QA forms | OPEN | Hosted capture of SH02 empty Stitch state at 1440 + 390 without wiping `bb-v8qa-…` forms |
| VQ-FIX-002 | **SH14-D / SH14-M** | Platform cross-tenant forms overview `/admin/forms` returns **403 Unavailable** for disposable HQ. No platform-admin QA credential in `.env.v8-qa-tenants.local`. | high | Disposable platform-admin identity **or** inventory out-of-scope / re-baseline | OPEN | HQ or platform-admin session reaches SH14 overview **200** with Stitch structure, **or** documented `PRODUCT_DECISION_DIFFERENCE` / out-of-scope |
| VQ-FIX-003 | **BB09-D / BB09-M** | Public event registration needs a published `blessboard.events` UUID; none discoverable on tenant. | high | Seed disposable published event (+ activity `event_id`); record fixture ID | OPEN | Anonymous GET event register URL **200**; capture BB09-D/M vs Stitch |
| VQ-FIX-004 | **BB10-D / BB10-M** | Same for ministry registration / `blessboard.ministries`. | high | Seed disposable published ministry; record fixture ID | OPEN | Anonymous GET ministry register URL **200**; capture BB10-D/M vs Stitch |
| VQ-FIX-005 | **BB16-D / BB16-M** (data half) | No open transfer; capture fell back to member profile (audit PARTIAL high). | high | Seed disposable open transfer + stable `/hq/membership/transfers/:id` | OPEN | Hosted transfer URL loads dedicated BB16 screen (not profile fallback); D/M shots vs Stitch |
| VQ-FIX-006 | **BB11-D / BB11-M** (data half) | Branch queue shows 0 while HQ has registrations — triage density vs Stitch populated queue. | medium | Confirm branch scoping + sample pending regs for Campus A | OPEN | Branch queue shows ≥1 pending sample; D/M density compare to Stitch |

---

## B. Confirmed application defects — P0

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-P0-001 | **BB21-D / BB21-M** | Public announcements **list** route `/c/:org/announcements` returns **404**. Only detail URL works. | high | Path-public announcements index → public list view (Stitch BB21) | OPEN | GET `/c/:org/announcements` **200**; list content matches Stitch intent; D/M hosted shots vs Stitch; detail (BB22) still works |
| VQ-P0-002 | **BB13-M** | Floating header overlaps subtitle/content; decision UI (approve / follow-up / decline) absent. | high | Branch/HQ registration detail mobile sticky header + decision controls | OPEN | At 390px: no header/content overlap; decision controls visible and usable; shot vs Stitch BB13-M |
| VQ-P0-003 | **BB14-M** | Save/transfer buttons overlap form fields — severe mobile layout break. | high | Member profile sticky action bar / field stacking | OPEN | At 390px: Save/Transfer do not overlap fields; shot vs Stitch BB14-M |
| VQ-P0-004 | **AN01-D / AN01-M** | Announcement studio dashboard missing Stitch KPI cards, filters, shell, and multi-status table (AN scorer FAIL). | high | Shared Announcement Studio shell uplift **or** product-skin decision | OPEN | Hosted AN01 D/M match Stitch density/intent **or** recorded `PRODUCT_DECISION_DIFFERENCE` + inventory note |
| VQ-P0-005 | **AN04-D / AN04-M** | Preview is an admin plain-text panel, not Stitch member-facing bulletin/hero preview (AN scorer critical FAIL). | high | Audience-facing preview chrome / PREVIEW MODE frame | OPEN | Hosted preview shows member-facing bulletin/hero (or explicit PREVIEW MODE) matching Stitch AN04 D/M |

> **Auth note:** Branch→HQ Form Studio wrong UI (**SH15**) was the audit’s authorization/UI FAIL; **closed by Prompt 39** (see closure ledger). SH14 remains a **fixture/credential** blocker (VQ-FIX-002), not a proven wrong-UI render of the designed SH14 screen.

---

## C. Confirmed application defects — P1

### C1. Form Studio mobile / state / overflow

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-P1-001 | **SH11-M** | Tab truncation / thinner list; harness flagged **overflowX** at 390px (audit mobile overflow table; scoreboard PARTIAL). | medium (overflow called out as confirmed) | Submissions list mobile tab row / overflow | OPEN | At 390px: no horizontal page overflow; tabs usable; shot vs Stitch SH11-M |
| VQ-P1-002 | **SH07-M** | Save sharing settings overlaps access-tier controls. | high (theme) | Sharing sticky save vs tier controls | OPEN | At 390px: no control overlap; shot vs Stitch SH07-M |
| VQ-P1-003 | **SH04-D / SH04-M** | Field-settings inspector not captured as Stitch state (SH scorer). | high (theme) / medium (scoreboard) | Target inspector panel state in UI + harness | OPEN | Hosted SH04 shows distinct field-settings inspector matching Stitch; D/M shots |
| VQ-P1-004 | **SH13-D / SH13-M** | Wrong workflow state vs Stitch status-transition / review-commit. | high (theme) / medium (scoreboard) | Submission detail review-commit UI state | OPEN | Hosted SH13 shows status-transition workflow matching Stitch; D/M shots |

### C2. Membership administration (remaining)

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-P1-010 | **BB01-D / BB01-M** | Membership forms admin thinner vs Stitch (spacing/typography/card density). | medium | BB membership admin skin | OPEN | D/M density closer to Stitch BB01 without breaking publish flow |
| VQ-P1-011 | **BB02-D / BB02-M** | Membership form detail thinner vs Stitch. | medium | Same | OPEN | D/M shots vs Stitch BB02 |
| VQ-P1-012 | **BB11-D / BB11-M** (UI half) | Branch queue triage density vs Stitch populated queue (after fixtures). | medium | VQ-FIX-006 data | OPEN | With pending samples, queue density matches Stitch intent |
| VQ-P1-013 | **BB12-D / BB12-M** | Registration detail thinner vs Stitch. | medium | Registration detail chrome | OPEN | D/M shots vs Stitch BB12 |
| VQ-P1-014 | **BB13-D** | Desktop registration decision usable but thinner. | medium | Decision chrome density | OPEN | Desktop shot vs Stitch BB13-D |
| VQ-P1-015 | **BB14-D** | Desktop member profile thinner; actions OK. | medium | Profile density | OPEN | Desktop shot vs Stitch BB14-D |
| VQ-P1-016 | **BB15-D / BB15-M** | Member edit thinner vs Stitch. | medium | Edit form grouping / sticky actions | OPEN | D/M shots vs Stitch BB15 |
| VQ-P1-017 | **BB16-D / BB16-M** (UI half) | Dedicated transfer screen weak / wrong state without fixture. | high | VQ-FIX-005 | OPEN | Dedicated transfer UI vs Stitch BB16 once fixture exists |
| VQ-P1-018 | **BB17-D / BB17-M** | HQ members directory thinner vs Stitch. | medium | Directory table/filter density | OPEN | D/M shots vs Stitch BB17 |
| VQ-P1-019 | **BB18-D / BB18-M** | Branch members overview thinner; **BB18-M** status chip truncation. | medium | Overview density + chip wrap/scroll at 390px | OPEN | D/M shots; 390px chips not truncating unusable |

### C3. Announcements — HQ, public detail, studio (non-P0)

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-P1-020 | **BB19-D / BB19-M** | HQ announcements list thinner vs Stitch. | medium | HQ announcements admin | OPEN | D/M shots vs Stitch BB19 |
| VQ-P1-021 | **BB20-D / BB20-M** | HQ announcement edit thinner vs Stitch. | medium | Admin edit form | OPEN | D/M shots vs Stitch BB20 |
| VQ-P1-022 | **BB22-D / BB22-M** | Public detail readable; article chrome simpler than Stitch. | low | Prefer after BB21 list exists | OPEN | D/M article chrome vs Stitch BB22 |
| VQ-P1-023 | **AN02-D / AN02-M** | Editor exists; major density gap vs Stitch (AN scorer PARTIAL major). | high | Shared studio shell with AN01 | OPEN | D/M editor density vs Stitch AN02 |
| VQ-P1-024 | **AN03-D / AN03-M** | Schedule exists; major density gap vs Stitch. | high | Same | OPEN | D/M schedule vs Stitch AN03 |
| VQ-P1-025 | **AN05-D / AN05-M** | Confirm-publish exists; major density gap vs Stitch. | high | Same | OPEN | D/M confirm-publish vs Stitch AN05 |
| VQ-P1-026 | **BB08-D / BB08-M** | Visitor public form thinner than Stitch BB08. | medium | Visitor public layout | OPEN | D/M shots vs Stitch BB08 |
| VQ-P1-027 | **BB07-D / BB07-M** | Submitted confirmation works; Stitch journey chrome richer (audit PARTIAL). Prompt 40 delivered functional BB07; visual chrome not re-scored. | low | Confirmation chrome polish | OPEN | Hosted BB07 D/M Stitch compare after wizard; no auto-login regression |

---

## D. Confirmed application defects — P2

| ID | Screen ID(s) | Defect (exact audit finding) | Severity | Dependency | Status | Acceptance test |
|----|--------------|------------------------------|----------|------------|--------|-----------------|
| VQ-P2-001 | **SH01-D / SH01-M** | Form Studio home missing Moovex/Stitch KPI/filter chrome (high structural theme). | high | Product skin decision vs uplift | OPEN | Accept `PRODUCT_DECISION_DIFFERENCE` **or** uplift; hosted D/M re-score |
| VQ-P2-002 | **SH03-D / SH03-M** | Studio builder thinner / sparse mobile. | medium | Form Studio builder chrome | OPEN | D/M shots vs Stitch SH03 |
| VQ-P2-003 | **SH05-D / SH05-M** | Preview secondary panels missing vs Stitch. | medium | Preview chrome | OPEN | D/M shots vs Stitch SH05 |
| VQ-P2-004 | **SH06-D / SH06-M** | Publication panels thinner vs Stitch. | medium | Publication secondary UI | OPEN | D/M shots vs Stitch SH06 |
| VQ-P2-005 | **SH07-D** | Sharing panels thinner vs Stitch. | medium | Sharing secondary UI | OPEN | Desktop shot vs Stitch SH07-D |
| VQ-P2-006 | **SH08-D / SH08-M** | Public form thinner vs Stitch (preserve consent). | medium | Public form chrome | OPEN | D/M shots vs Stitch SH08; consent still required |
| VQ-P2-007 | **SH09-D / SH09-M** | Validation banner works; Stitch journey chrome richer. | low | Validation chrome | OPEN | D/M minor polish vs Stitch SH09 |
| VQ-P2-008 | **SH11-D** | Submissions list secondary panels missing. | medium | List chrome | OPEN | Desktop shot vs Stitch SH11-D |
| VQ-P2-009 | **SH12-D / SH12-M** | Submission detail thinner vs Stitch. | medium | Detail chrome | OPEN | D/M shots vs Stitch SH12 |

---

## E. Open count roll-up (audit-based; not a full re-score)

| Bucket | Count | Notes |
|--------|------:|-------|
| Audit baseline (Prompt 37) | PASS **2** / PARTIAL **56** / FAIL **18** / BLOCKED **8** | Locked in overnight baseline |
| FAIL closed by 39–40 (functional, not Stitch re-score) | **10** | SH15×2 + BB03–BB06×8 |
| Remaining open FAIL (app) | **8** | BB13-M, BB14-M, BB21×2, AN01×2, AN04×2 |
| Remaining BLOCKED (fixtures) | **8** | SH02×2, SH14×2, BB09×2, BB10×2 |
| Remaining PARTIAL | **56** | Unchanged — no PARTIAL screen fully re-scored to PASS |
| Preserve PASS | **2** | SH10-D/M |

**Full 84-screen hosted visual re-audit still required** before claiming new PASS/PARTIAL/FAIL totals.

---

## F. Changelog

| Date | Prompt | Change |
|------|--------|--------|
| 2026-09-21 | 41 | Created backlog from Prompt 37 reconciled audit; excluded SH15 + BB03–BB06 FAILs closed by Prompts 39–40 |

---

## G. Next recommended implementation task

1. **VQ-P0-001 (BB21-D/M)** — wire path-public announcements **list** (broken primary public journey).  
2. Then **VQ-P0-002 / VQ-P0-003** (BB13-M / BB14-M mobile layout breakage).  
3. Parallel fixture work: **VQ-FIX-003 / VQ-FIX-004** (BB09/BB10) and **VQ-FIX-001 / VQ-FIX-002** (SH02/SH14).
