# V8 Hosted 84-Screen Visual Audit

**Prompt:** 37  
**Verdict:** `V8_HOSTED_84_SCREEN_VISUAL_OPEN_DEFECTS`  
**Date:** 2026-09-21  
**Branch / deployment:** V8 only — `moovex-platform-v8-testing`  
**Hosted application SHA:** `bd2916bd3141` (confirmed via `/healthz` `gitSha`)  
**Local tip matches hosted:** `bd2916bd3141c30567f8571325babe16c3938102`  
**Schema compatible:** `true`  
**Stitch project:** [projects/5087412725796049014](https://stitch.withgoogle.com/projects/5087412725796049014)  
**Tenant / accounts:** disposable V8 QA only — `bb-v8qa-mub23a6v6a6b` (HQ + Branch from `.env.v8-qa-tenants.local`)  
**Viewports:** Desktop **1440×900**, Mobile **390×844**  
**Method:** Playwright full-page screenshots of live hosted routes + visual compare to Stitch `screenshot.downloadUrl` assets. **Source inspection and bare HTTP 200 were not counted as visual verification.** Scores reconciled after parallel visual review by [SH scorer](d210f929-3f9c-46bf-bc16-614f084cd1eb), [BB scorer](dfc48249-209d-4d70-91f5-d1da594535c9), and [AN scorer](44e12ad0-9ef9-461e-a7fe-386968bfb1d6).

Evidence (local machine, not committed):
- Hosted shots: `/tmp/v8-visual-audit/shots/{CODE}.png`
- Stitch refs: `/tmp/v8-visual-audit/stitch/{CODE}.png`
- Capture matrix: `/tmp/v8-visual-audit/capture-results.json`
- Scores: `/tmp/v8-visual-audit/visual-scores.json`
- Harness: `scripts/local/v8-hosted-84-screen-visual-capture.js`

---

## Summary counts

| Result | Count |
|--------|------:|
| **PASS** | **2** |
| **PARTIAL** | **56** |
| **FAIL** | **18** |
| **BLOCKED** | **8** |
| **Total** | **84** |

| Family | PASS | PARTIAL | FAIL | BLOCKED |
|--------|-----:|--------:|-----:|--------:|
| SH01–SH15 (× D/M) | 2 | 22 | 2 | 4 |
| BB01–BB22 (× D/M) | 0 | 34 | 10 | 4 |
| AN01–AN05 (× D/M) | 0 | 6 | 4 | 0 |

> PASS = SH10-D/M (thanks confirmation). BLOCKED = SH02×2, SH14×2, BB09×2, BB10×2. FAIL includes SH15×2, BB03–BB06×2, BB13-M, BB14-M, BB21×2, AN01×2, AN04×2.

---

## Screens inspected

All **84** inventory codes were attempted in tenant context:

| Range | Inspected |
|-------|-----------|
| SH01–SH15 −D/−M | Yes (12 captured visually; 4 BLOCKED) |
| BB01–BB22 −D/−M | Yes (40 captured visually; 4 BLOCKED) |
| AN01–AN05 −D/−M | Yes (10 captured visually) |

Primary hosted routes used (BlessBoard disposable tenant):

| Screen family | Primary hosted URL(s) |
|---------------|------------------------|
| SH01 | `/hq/form-studio` |
| SH03–SH07 | `/hq/form-studio/:id/{studio,preview,publication,sharing}` |
| SH08–SH10 | `/f/:token` (+ validation submit / successful thanks submit) |
| SH11–SH13 | `/hq/form-studio/:id/submissions[/ :submissionId]` |
| SH14 | `/admin/forms` |
| SH15 | Branch session → `/hq/form-studio` |
| BB01–BB02 | `/hq/membership/forms[/ :formId]` |
| BB03–BB07 | `/c/:org/register` (+ `/register/submitted`) |
| BB08 | `/c/:org/visit` |
| BB09–BB10 | *(no event/ministry resource)* |
| BB11–BB13 | `/branch-admin/registrations` · `/hq/registrations/:id` |
| BB14–BB16 | `/hq/members/:id` |
| BB17–BB18 | `/hq/members` · `/branch-admin/members` |
| BB19–BB20 | `/hq/announcements` · `…/:id/edit` |
| BB21–BB22 | `/c/:org/announcements/:id` (list 404) |
| AN01–AN05 | `/hq/announcement-studio` · `/:id` · `/schedule` · `/preview` · `/confirm-publish` |

---

## Missing visual evidence

| Item | Status |
|------|--------|
| Stitch screenshot for each of 84 codes | **Present** under `/tmp/v8-visual-audit/stitch/` |
| Hosted screenshot for non-BLOCKED screens | **Present** under `/tmp/v8-visual-audit/shots/` |
| SH02 empty-state hosted UI | **Missing (BLOCKED)** — tenant has existing forms |
| SH14 platform-admin overview | **Missing (BLOCKED)** — HQ 403 on `/admin/forms` |
| BB09 / BB10 public event & ministry register | **Missing (BLOCKED)** — no published `blessboard.events` / `ministries` IDs on disposable tenant |
| Designed SH15 `access-denied.ejs` | **Not reached** — captured HQ shell plain-text deny instead (scored **FAIL**) |
| Discrete BB04–BB06 step screenshots | **Not attainable** — hosted registration is single-page (scored **FAIL**) |
| BB21 public **list** | **Not attainable** — `/c/:org/announcements` **404** (detail captured; scored **FAIL**) |

---

## BLOCKED screens (8)

| Code | Reason |
|------|--------|
| SH02-D / SH02-M | Empty Forms Management state requires zero forms; disposable tenant already has forms. Cannot wipe without destroying overnight QA artifacts. |
| SH14-D / SH14-M | Platform cross-tenant forms overview (`/admin/forms`) returns **403 Unavailable** for disposable HQ. No platform-admin QA credential in `.env.v8-qa-tenants.local`. |
| BB09-D / BB09-M | Public event registration needs a published event UUID; activity admin requires `event_id` tied to `blessboard.events`. None discoverable on tenant. |
| BB10-D / BB10-M | Same for ministry registration / `blessboard.ministries`. |

---

## FAIL screens (18) — by severity

### High

| Code | Defect | Recommended fix |
|------|--------|-----------------|
| **BB03-D/M – BB06-D/M** | Stitch shows a **4-step wizard** (Personal → Spiritual → Interests → Review). Hosted `/c/:org/register` is a **single-page** form with all sections. Step screens cannot be visually verified as designed. | Either implement Stitch multi-step flow with progress stepper, or revise Stitch/product decision and re-baseline inventory so BB03–BB06 map to one scrollable page with explicit `PRODUCT_DECISION_DIFFERENCE`. |
| **BB21-D/M** | Public announcements **list** route `/c/:org/announcements` returns **404**. Only detail URL works. | Wire path-public announcements index to the public list view used by BB21 Stitch. |
| **SH15-D/M** | Branch→HQ Form Studio returns plain HTML *“You do not have access to this site.”* — not `views/platform/forms/access-denied.ejs` (SH15). Branch `/branch-admin/form-studio` is allowed, so designed deny is unreachable with available QA roles. | Route unauthorized Form Studio viewers through `access-denied` render; add a disposable role without `requests.*` / form manage for QA. |
| **AN01-D/M** | Announcement studio dashboard missing Stitch KPI cards, filters, shell, and multi-status table ([AN scorer](44e12ad0-9ef9-461e-a7fe-386968bfb1d6)). | Product decision on Moovex chrome vs thin studio, or uplift AN01 to Stitch density. |
| **AN04-D/M** | Preview is an admin plain-text panel, not Stitch member-facing bulletin/hero preview (critical per AN scorer). | Render audience-facing preview chrome (or explicit PREVIEW MODE frame matching Stitch). |
| **BB13-M** | Floating header overlaps subtitle/content; decision UI absent ([BB scorer](dfc48249-209d-4d70-91f5-d1da594535c9)). | Fix mobile sticky header stacking; expose approve/follow-up/decline decision controls. |
| **BB14-M** | Save/transfer buttons overlap form fields — severe mobile layout break (BB scorer). | Fix sticky action bar / field stacking on member profile mobile. |

---

## PASS screens (2)

| Code | Notes |
|------|-------|
| **SH10-D / SH10-M** | Submission confirmation hierarchy (received, thank-you, reference) matches Stitch intent ([SH scorer](d210f929-3f9c-46bf-bc16-614f084cd1eb)); chrome still thinner than Stitch next-steps. |

## PARTIAL themes (56) — severity-grouped

### High — structural / chrome gap vs Stitch

| Theme | Screens | Notes / recommended fix |
|-------|---------|-------------------------|
| Shared Form Studio vs Moovex enterprise Stitch | SH01, SH03–SH08, SH11–SH13 | Hosted BlessBoard Form Studio is a thinner allowlisted builder. Stitch shows Moovex/ActiveClinic shell, KPI cards, filters, HIPAA rails. **Decide:** product-skin acceptance (`PRODUCT_DECISION_DIFFERENCE`) vs bring Stitch density into BB/AC skins. |
| Field settings / review-commit not distinct | SH04, SH13 | SH04 inspector and SH13 status-transition workflow not captured as Stitch states (SH scorer). |
| Sharing mobile overlap | SH07-M | Save sharing settings overlaps access-tier controls. |
| Shared Announcement Studio (non-FAIL) | AN02, AN03, AN05 | Editor/schedule/confirm exist but major density gaps vs Stitch (AN scorer). |
| Membership transfer dedicated screen weak | BB16 | No open transfer; capture fell back to member profile. Seed disposable transfer + open `/hq/membership/transfers/:id`. |
| Branch queue empty vs HQ registrations | BB11 | Branch queue shows 0 while HQ has registrations — triage density vs Stitch populated queue. Confirm branch scoping + sample pending regs for Campus A. |

### Medium — right screen family, thinner UI

| Theme | Screens | Recommended fix |
|-------|---------|-----------------|
| Membership admin / directory / profile | BB01–BB02, BB12–BB13-D, BB14-D, BB15, BB17–BB18 | Keep functional parity; close spacing/typography/card density toward Stitch where product allows. |
| Church announcements HQ + public detail | BB19–BB20, BB22 | Incremental Stitch polish on admin form and public article chrome. |
| Visitor public form | BB08 | Align visitor public layout closer to Stitch BB08. |
| Form Studio publication / sharing / submissions | SH05–SH07-D, SH11-D, SH12 | Secondary panels missing vs Stitch. |
| Mobile submissions | SH11-M | Tab truncation / thinner list; harness also noted overflowX — still watch on 390px. |

### Low — usable, minor Stitch delta

| Theme | Screens | Notes |
|-------|---------|-------|
| Validation / submitted | SH09, BB07 | Validation banner and submitted confirmation work; Stitch journey chrome richer. |
| Public announcement detail | BB22 | Readable detail; article chrome simpler than Stitch. |

---

## Permissions & confidential-data masking

| Check | Result |
|-------|--------|
| Branch cannot open HQ Form Studio | **Denied** (403) — but **wrong UI** (plain text, not SH15). |
| Branch Form Studio allowed | **Yes** — `/branch-admin/form-studio` 200. |
| Platform admin forms | **Blocked** for QA HQ (SH14). |
| Branch membership overview copy | States contact fields display-only / normalized identifiers hidden (BB18 capture). |
| Pastoral / clinical claims on BB18 | Not asserted in hosted overview (aligned with prior BB18-M notes). |
| Public form consent | Consent required; validation surfaces when missing (SH09). |

---

## Mobile overflow / touch / spacing

| Finding | Screens |
|---------|---------|
| Confirmed overflow at 390px | **SH11-M** (FAIL) |
| Status tab truncation / horizontal chip row | BB18-M (PARTIAL) |
| Generally readable text / primary CTAs ≥ usable | Most captured BB HQ/branch shells |
| Sparse Form Studio mobile | SH03–SH07-M (PARTIAL) |

---

## Per-screen scoreboard

| Code | Result | Severity | Evidence |
|------|--------|----------|----------|
| SH01-D | PARTIAL | high | shot + stitch |
| SH01-M | PARTIAL | high | shot + stitch |
| SH02-D | BLOCKED | medium | no empty tenant |
| SH02-M | BLOCKED | medium | no empty tenant |
| SH03-D | PARTIAL | medium | shot + stitch |
| SH03-M | PARTIAL | medium | shot + stitch |
| SH04-D | PARTIAL | medium | shot + stitch |
| SH04-M | PARTIAL | medium | shot + stitch |
| SH05-D | PARTIAL | medium | shot + stitch |
| SH05-M | PARTIAL | medium | shot + stitch |
| SH06-D | PARTIAL | medium | shot + stitch |
| SH06-M | PARTIAL | medium | shot + stitch |
| SH07-D | PARTIAL | medium | shot + stitch |
| SH07-M | PARTIAL | medium | shot + stitch |
| SH08-D | PARTIAL | medium | shot + stitch |
| SH08-M | PARTIAL | medium | shot + stitch |
| SH09-D | PARTIAL | low | shot + stitch |
| SH09-M | PARTIAL | low | shot + stitch |
| SH10-D | PASS | low | shot + stitch (thanks) |
| SH10-M | PASS | low | shot + stitch (thanks) |
| SH11-D | PARTIAL | medium | shot + stitch |
| SH11-M | PARTIAL | medium | tab truncate / watch overflow |
| SH12-D | PARTIAL | medium | shot + stitch |
| SH12-M | PARTIAL | medium | shot + stitch |
| SH13-D | PARTIAL | medium | shot + stitch |
| SH13-M | PARTIAL | medium | shot + stitch |
| SH14-D | BLOCKED | high | 403 `/admin/forms` |
| SH14-M | BLOCKED | high | 403 `/admin/forms` |
| SH15-D | FAIL | high | plain-text deny |
| SH15-M | FAIL | high | plain-text deny |
| BB01-D | PARTIAL | medium | shot + stitch |
| BB01-M | PARTIAL | medium | shot + stitch |
| BB02-D | PARTIAL | medium | shot + stitch |
| BB02-M | PARTIAL | medium | shot + stitch |
| BB03-D | FAIL | high | single-page vs wizard |
| BB03-M | FAIL | high | single-page vs wizard |
| BB04-D | FAIL | high | no step UI |
| BB04-M | FAIL | high | no step UI |
| BB05-D | FAIL | high | no step UI |
| BB05-M | FAIL | high | no step UI |
| BB06-D | FAIL | high | no step UI |
| BB06-M | FAIL | high | no step UI |
| BB07-D | PARTIAL | low | shot + stitch |
| BB07-M | PARTIAL | low | shot + stitch |
| BB08-D | PARTIAL | medium | shot + stitch |
| BB08-M | PARTIAL | medium | shot + stitch |
| BB09-D | BLOCKED | high | no event id |
| BB09-M | BLOCKED | high | no event id |
| BB10-D | BLOCKED | high | no ministry id |
| BB10-M | BLOCKED | high | no ministry id |
| BB11-D | PARTIAL | medium | shot + stitch |
| BB11-M | PARTIAL | medium | shot + stitch |
| BB12-D | PARTIAL | medium | shot + stitch |
| BB12-M | PARTIAL | medium | shot + stitch |
| BB13-D | PARTIAL | medium | shot + stitch |
| BB13-M | FAIL | high | header overlap |
| BB14-D | PARTIAL | medium | shot + stitch |
| BB14-M | FAIL | high | action/field overlap |
| BB15-D | PARTIAL | medium | shot + stitch |
| BB15-M | PARTIAL | medium | shot + stitch |
| BB16-D | PARTIAL | high | no transfer record |
| BB16-M | PARTIAL | high | no transfer record |
| BB17-D | PARTIAL | medium | shot + stitch |
| BB17-M | PARTIAL | medium | shot + stitch |
| BB18-D | PARTIAL | medium | shot + stitch |
| BB18-M | PARTIAL | medium | shot + stitch |
| BB19-D | PARTIAL | medium | shot + stitch |
| BB19-M | PARTIAL | medium | shot + stitch |
| BB20-D | PARTIAL | medium | shot + stitch |
| BB20-M | PARTIAL | medium | shot + stitch |
| BB21-D | FAIL | high | list 404 |
| BB21-M | FAIL | high | list 404 |
| BB22-D | PARTIAL | low | shot + stitch |
| BB22-M | PARTIAL | low | shot + stitch |
| AN01-D | FAIL | high | shot + stitch |
| AN01-M | FAIL | high | shot + stitch |
| AN02-D | PARTIAL | high | shot + stitch |
| AN02-M | PARTIAL | high | shot + stitch |
| AN03-D | PARTIAL | high | shot + stitch |
| AN03-M | PARTIAL | high | shot + stitch |
| AN04-D | FAIL | high | shot + stitch |
| AN04-M | FAIL | high | shot + stitch |
| AN05-D | PARTIAL | high | shot + stitch |
| AN05-M | PARTIAL | high | shot + stitch |

---

## Recommended fix priority

1. **P0 — unblock / correct screen family**
   - Public announcements **list** (BB21).
   - Seed disposable **published event + ministry** (or fixture IDs) for BB09/BB10.
   - Platform-admin disposable credential **or** document SH14 as out-of-scope for tenant QA.
   - Empty-tenant path **or** fixture for SH02.
2. **P0 — membership wizard decision**
   - Multi-step Stitch BB03–BB06 vs single-page hosted register — product decision + implementation or Stitch re-baseline.
3. **P0 — mobile layout breakage**
   - **BB14-M** overlapping Save/Transfer vs fields; **BB13-M** floating header overlap.
4. **P1 — access-denied UX**
   - Render SH15 `access-denied.ejs` for unauthorized Form Studio; add role fixture.
5. **P1 — announcement studio preview/dashboard**
   - AN01 dashboard density; AN04 audience-facing preview chrome.
6. **P1 — Form Studio mobile / state targeting**
   - SH07-M control overlap; SH04/SH13 distinct panel states; SH11-M tab overflow.
7. **P2 — Stitch density**
   - Shared Form Studio / Announcement Studio chrome vs Moovex Stitch: accept as `PRODUCT_DECISION_DIFFERENCE` or schedule visual uplift.

---

## Scope controls

- **V8 only** — no V7 or production code/config changes in this prompt.
- Disposable QA tenants only; no production writes.
- Visual audit does **not** claim pixel-perfect parity; PASS requires clear Stitch intent match without material missing structure.

---

## Final verdict

**`V8_HOSTED_84_SCREEN_VISUAL_OPEN_DEFECTS`**

PASS **2** / PARTIAL **56** / FAIL **18** / BLOCKED **8** (total **84**).
