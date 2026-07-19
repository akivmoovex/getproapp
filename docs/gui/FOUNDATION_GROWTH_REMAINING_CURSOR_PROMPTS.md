# Foundation & Growth — remaining Cursor Agent prompts

**Date:** 2026-07-19
**Mode:** Documentation only — no application code
**Sources:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md) · [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md) · [`BLESSBOARD_PRICING_DECISION.md`](../product/BLESSBOARD_PRICING_DECISION.md) · [`FOUNDATION_GROWTH_BLOCKED_SCREENS.md`](./FOUNDATION_GROWTH_BLOCKED_SCREENS.md)

**Schedule companion:** [`FOUNDATION_GROWTH_AGENT_WINDOW_SCHEDULE.md`](./FOUNDATION_GROWTH_AGENT_WINDOW_SCHEDULE.md)

**Rule:** One prompt = one queue batch ≤ two tightly related screens. No project-history dumps. No schema/auth/session/hostname/billing changes unless a batch explicitly requires a tiny product decision.

**Already done — do not re-run:** FG-01 Features · FG-08a HQ reports hub + attendance

---

## Summary counts

| Metric | Count |
|--------|------:|
| Implementation prompts generated | **15** (prompts **1–15** = FG-Q01–Q15) |
| Foundation / Platform commercial | **10** (prompts 1–10) |
| Growth | **3** (prompts 11–13) |
| Shared final audits | **2** (prompts 14–15) |
| Window-reset prompts | **6** |
| Agent windows (≤4 related batches) | **6** |
| First implementation prompt number | **1** (FG-Q01 Apex Home) |

---

## Excluded (no prompts)

| Class | Items |
|-------|-------|
| `MISSING_BACKEND` | Waiting verification; dedicated `/member/prayer-request`; departments; duty roster; BA/HQ monthly reports; HQ roles; HQ org templates; `max_branches` provision wiring |
| `DEFERRED` | Forgot password; scheduled comms/reports; offline attendance; surveys; appointments; volunteers; advanced care automation |
| `NOT_IN_SCOPE` | Leader portal; Network domain/email/API; banking/QR checkout |
| `MISSING_STITCH` | Auth error/account; BA/HQ settings; BA sermons/forms admin; media library |
| `COMPLETE` | Features (FG-01); attendance report + basic hub (FG-08a); CLOSE PARITY portal screens |

---

# WINDOW W1 — Apex Home + commercial (prompts 1–4)

## Window-reset prompt A

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W1 Apex Home + commercial)

Continue on current V5 branch. Do not restore V4. Do not flip shadow/authoritative routing.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/product/BLESSBOARD_PRICING_DECISION.md
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (this window’s prompts only)

Rules for every batch in this window:
- Presentation/EJS/CSS only
- Max two tightly related screens
- Exact Stitch IDs from the prompt
- Preserve routes, data, auth, authorization, CSRF, tenant/apex scope, field names, POST targets
- Existing backend data only — no fake records or unsupported actions
- Reuse apex shell + Sacred Modernity tokens (Hanken / #6C5CE7)
- Test 375px, 768px, 1440px; static overflow guard at 320px
- Focused tests only; stylelint changed CSS only; git diff --check
- Create one docs/gui/BATCH_*.md; stop after that batch
- Bump CSS ?v= when shell CSS changes
- Commit only if explicitly asked

FG-01 Features and FG-08a are already done — skip them.
Execute prompts 1 → 2 → 3 → 4 in order. One batch per turn; stop after each batch completes.
```

---

## Prompt 1 — FG-Q01 Apex Home

**Package:** Platform · **Status:** PARTIAL · **Queue:** FG-Q01

```text
IMPLEMENT FG-Q01 — Apex Home

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q01)
- docs/gui/BATCH_FG01_APEX_FEATURES.md (pattern only)
- docs/gui/BATCH_02_APEX_HOME_LOGIN_ACCOUNT.md (if present)
- Files for apex `/` only: apex home EJS, apex-shell-*, apex.css, renderTenantLandingPage.js (presentation locals only)

Implement only: Apex Home (one screen, D+M pair).

Canonical Stitch IDs:
- Desktop 46081ff8f3d04090b9de33020bdf1530
- Mobile 9f9927a608024e4ebaae11f13e68bdc5

Requirements:
- Preserve apex GET `/`, marketing nav, CTAs to existing routes only
- No fake church counts, KPIs, or payment CTAs
- Intentional V5 nav differences OK — do not invent missing product routes beyond existing `/features` `/pricing` `/login` etc.
- Reuse apex shell + design tokens; Powered by GetPro preserved
- No auth/session/schema/billing changes

Viewport: 375 / 768 / 1440 + static overflow check at 320px
Test focused: npm run test:blessboard:apex-home · test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q01_APEX_HOME.md
Report: files, Stitch IDs, data shown, omitted unsupported, responsive, tests, gaps, suggested commit
Suggested commit: Tighten apex Home presentation to canonical BlessBoard Stitch desktop/mobile pair.
Stop after this batch.
```

---

## Prompt 2 — FG-Q02 Apex Pricing (+ FAQ)

**Package:** Platform · **Status:** PARTIAL · **Queue:** FG-Q02

```text
IMPLEMENT FG-Q02 — Apex Pricing + FAQ

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q02)
- docs/product/BLESSBOARD_PRICING_DECISION.md
- docs/gui/BATCH_FG01_APEX_FEATURES.md (pattern only)
- Files for /pricing only (apex pricing EJS, apex.css, platformPricingContent / catalogue)

Implement only (two tightly related surfaces on one route):
1. Pricing
2. Pricing Details & FAQ (same /pricing, e.g. #faq)

Canonical Stitch IDs:
- Pricing Desktop 1c50e8987d9043ec941b07fb0f67cef5 · Mobile 181ec1f8076c4ae7ad6be92d5a4861f3
- FAQ Desktop c47840e7030c449a94c4ce4a03fa932f · Mobile 65067eb3ebfe45b2a810531334c54684

Requirements:
- Preserve public apex GET only — no checkout/payment/POST invention
- Show Foundation / Growth / Network only per pricing SoT — ignore decorative Stitch four-tier staff prices
- No fake billing amounts, trial CTAs, or Network sold as Growth self-serve
- Reuse apex shell + Sacred Modernity tokens

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q02_APEX_PRICING.md
Suggested commit: Align apex Pricing and FAQ chrome with approved package SoT and Stitch.
Stop after this batch.
```

---

## Prompt 3 — FG-Q03 Apex Church Directory

**Package:** Platform · **Status:** PARTIAL · **Queue:** FG-Q03

```text
IMPLEMENT FG-Q03 — Apex Church Directory

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q03)
- Latest related apex batch docs (FG-Q01/Q02 or FG-01 pattern)
- Files for /directory only

Implement only: Church Directory (D+M pair).

Canonical Stitch IDs:
- Desktop 2b9df962f4ff4b4e8a45be51f99a5497
- Mobile ab5d47e2d6c54065a4eb66c906d3c39c

Requirements:
- Catalogue-backed list only — no fake orgs
- No UUIDs/secrets in HTML; prefer safe live testing labels
- Preserve apex-only gate and existing query behavior
- No auth/schema changes

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q03_APEX_DIRECTORY.md
Suggested commit: Polish apex Directory against canonical BlessBoard Stitch pair.
Stop after this batch.
```

---

## Prompt 4 — FG-Q04 Apex Register Your Church

**Package:** Platform · **Status:** PARTIAL · **Queue:** FG-Q04

```text
IMPLEMENT FG-Q04 — Register Your Church

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q04)
- Files for /register-church only

Implement only: Register Your Church (D+M pair).

Canonical Stitch IDs:
- Desktop 8640e8531e7144c3a048617592979cb7
- Mobile 515da582d2504feaaa00c03b7a2e77e1

Requirements:
- Enquiry UI polish only — NO self-serve org provision POST
- Do not fake “request sent” success without an existing product mailer path
- Preserve apex shell, SEO, a11y
- No auth/schema/billing

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q04_APEX_REGISTER_CHURCH.md
Suggested commit: Polish Register Your Church enquiry layout to Stitch without adding provision.
Stop after this batch.
```

---

# WINDOW W2 — Apex For Churches (prompt 5)

## Window-reset prompt B

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W2 For Churches)

Continue on current V5 branch. Do not restore V4. Do not flip routing modes.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/product/BLESSBOARD_PRICING_DECISION.md
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (W2 prompt only)

Rules: presentation only; ≤2 screens; exact Stitch IDs; preserve routes/auth/CSRF/scope; no fake data; no Network-as-Growth; focused tests; stylelint changed CSS; git diff --check; one BATCH_*.md; stop after batch; bump CSS ?v= when needed.

W1 apex batches may already be done — do not redo unless broken.
Execute prompt 5 only.
```

---

## Prompt 5 — FG-Q05 Apex For Churches

**Package:** Platform · **Status:** PARTIAL · **Queue:** FG-Q05

```text
IMPLEMENT FG-Q05 — Apex For Churches

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q05)
- docs/product/BLESSBOARD_PRICING_DECISION.md
- Files for /for-churches only

Implement only: For Churches (D+M pair).

Canonical Stitch IDs:
- Desktop fc4bf5aab5bb4737a56d72030bae8803
- Mobile 55af3450069944598d9f0ce17df12da6

Requirements:
- Match pricing decision copy — Network custom domain/email/API are assisted, not Foundation/Growth self-serve
- No fake metrics, checkout, or invented enterprise sales flows
- Preserve apex-only GET and existing CTAs to live routes
- Reuse apex shell + design tokens

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q05_APEX_FOR_CHURCHES.md
Suggested commit: Polish For Churches marketing page to canonical Stitch pair.
Stop after this batch.
```

---

# WINDOW W3 — Branch content + HQ content (prompts 6–9)

## Window-reset prompt C

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W3 Branch + HQ content)

Continue on current V5 branch. Do not restore V4. Do not flip routing modes.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (W3 prompts only)
- Read docs/gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md (do not implement blocked rows)

Rules: presentation only; ≤2 screens per batch; exact Stitch IDs; preserve routes, CSRF, church/branch scope, field names, POST targets; no departments/duty roster/KPI invention; no SMS/scheduling; focused tests; stylelint changed CSS; git diff --check; one BATCH_*.md; stop after each batch.

Do not mix unfinished apex marketing into this window.
Execute prompts 6 → 7 → 8 → 9 in order.
```

---

## Prompt 6 — FG-Q08 Branch ministry profile

**Package:** Foundation · **Status:** PLACEHOLDER · **Queue:** FG-Q08

```text
IMPLEMENT FG-Q08 — Branch ministry profile

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q08)
- Existing content-admin ministries / entity-fields files only

Implement only: Ministry profile admin chrome (entity-fields + tightly related list chrome if required).

Canonical Stitch IDs:
- Desktop 064769bb18ab455fb2a39adf2f3c080a
- Mobile 17509b0d718346daaf4ac3b6c6f29d42

Requirements:
- Existing entity fields only — no departments, duty roster, leader KPIs, or chat
- Preserve church/branch scoping, CSRF, and content-admin authz
- Reuse branch-admin shell + V5 design components
- Elevate PLACEHOLDER → PARTIAL presentation (no new routes)

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:content-admin · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q08_MINISTRY_PROFILE.md
Suggested commit: Elevate branch ministry entity editor toward Stitch ministry profile chrome.
Stop after this batch.
```

---

## Prompt 7 — FG-Q09 Branch announcement preview

**Package:** Foundation · **Status:** PARTIAL · **Queue:** FG-Q09

```text
IMPLEMENT FG-Q09 — Branch announcement preview polish

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q09)
- announcements admin-preview / publish templates and CSS only as needed

Implement only: Announcements admin preview (publish chrome only if tightly required for preview).

Canonical Stitch IDs:
- Desktop 65941542c13048edb2c62bccd01ddcea
- Mobile daa416025c704a5693b295ef3139af89

Requirements:
- No SMS, scheduling, or fabricated delivery metrics
- Preserve publish-now behavior and existing CSRF/POST targets
- Branch/church scope + authz intact

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:announcements · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q09_ANNOUNCEMENT_PREVIEW.md
Suggested commit: Polish branch announcement preview chrome to Stitch management pair.
Stop after this batch.
```

---

## Prompt 8 — FG-Q10 Branch website editor

**Package:** Foundation · **Status:** PARTIAL · **Queue:** FG-Q10

```text
IMPLEMENT FG-Q10 — Branch website editor

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q10)
- content-admin index/page/section/preview templates and branch-admin CSS only

Implement only: Website editor overview + page/section chrome (tightly related; max two composition surfaces).

Canonical Stitch IDs:
- Desktop 3f3160664d91423d80cb4ba81e2af6c4
- Mobile f2bb5e794f074a1aa3d248a2fe54ddeb

Requirements:
- Existing CMS fields/routes only — not a full Stitch website-builder canvas invention
- Preserve publish/preview CSRF, authz, and branch scope
- No theme/domain/SEO self-serve invention
- Reuse branch-admin shell + design tokens

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:content-admin · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q10_WEBSITE_EDITOR.md
Suggested commit: Align branch website editor chrome with Stitch website-editor pair.
Stop after this batch.
```

---

## Prompt 9 — FG-Q11 HQ public content oversight

**Package:** Growth · **Status:** PARTIAL · **Queue:** FG-Q11

```text
IMPLEMENT FG-Q11 — HQ public content oversight

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q11)
- docs/gui/BATCH_18A_HQ_CONTENT.md (if present)
- HQ content mount of content-admin + hq-admin.css only

Implement only: HQ `/hq/content` oversight chrome (shared templates with FG-Q10).

Canonical Stitch IDs (website-editor 34 reuse — do not invent org-templates 60):
- Desktop 3f3160664d91423d80cb4ba81e2af6c4
- Mobile f2bb5e794f074a1aa3d248a2fe54ddeb

Requirements:
- Preserve HQ authz, `/b/:branchKey` scoping, CSRF, and existing page summaries only
- No fabricated theme/domain/SEO/builder/templates
- No Network claims; no org-templates Stitch pair
- Prefer running after FG-Q10 (shared templates)

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:content-admin · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q11_HQ_CONTENT.md
Suggested commit: Polish HQ public content oversight using website-editor Stitch chrome.
Stop after this batch.
```

---

# WINDOW W4 — Growth advanced reports (prompts 10–11)

## Window-reset prompt D

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W4 Growth reports)

Continue on current V5 branch. Do not restore V4. Do not flip routing modes.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/product/BLESSBOARD_PRICING_DECISION.md
- Read docs/gui/BATCH_FG08A_HQ_REPORTS.md (pattern for Growth gate)
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (W4 prompts only)

Rules: presentation + soft entitlement gate only if mirroring FG-08a; no new report generators; no donor PII/CSV/forecasts; do not weaken advanced_reports; focused tests; stylelint changed CSS; git diff --check; one BATCH_*.md; stop after each batch.

FG-08a hub + attendance already done — do not redo.
Execute prompts 10 → 11 in order.
```

---

## Prompt 10 — FG-Q12 HQ giving report + Growth gate

**Package:** Growth · **Status:** PARTIAL · **Queue:** FG-Q12

```text
IMPLEMENT FG-Q12 — HQ giving report + Growth entitlement chrome

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q12)
- docs/gui/BATCH_FG08A_HQ_REPORTS.md (mirror attendance gate pattern)
- hq/giving-report.ejs, hq/reports.ejs hub card, hqReportsRoutes/service (gate only), hq-admin.css

Implement only (tightly related pair):
1. `/hq/reports/giving` presentation + Growth gate
2. Hub card labels on `/hq/reports` for giving (if required for gate honesty)

Canonical Stitch IDs (consolidated analytics 57):
- Desktop 2a577dc15d4342acb152f16aed21c267
- Mobile 06489c79d0d04a429e57eba5c717ba47

Requirements:
- Mirror FG-08a: Foundation gets honest denied/fallback; Growth sees live aggregates
- Soft advanced_reports gate only — do not weaken entitlement
- Live currency/category aggregates only — no donor PII, CSV, forecasts, canvas charts
- Preserve HQ authz and branch filter behavior

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:reports-audit · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q12_HQ_GIVING_REPORT.md
Suggested commit: Gate HQ giving report behind advanced_reports with Stitch analytics chrome.
Stop after this batch.
```

---

## Prompt 11 — FG-Q13 HQ branch performance PLACEHOLDER

**Package:** Growth · **Status:** PLACEHOLDER · **Queue:** FG-Q13

```text
IMPLEMENT FG-Q13 — HQ branch performance PLACEHOLDER lift

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q13)
- docs/gui/BATCH_FG08A_HQ_REPORTS.md / BATCH_FG_Q12 if present
- hq/reports.ejs presentation only — no new services/generators

Implement only: Reports hub performance presentation lift toward branch-performance Stitch (aggregates already on hub).

Canonical Stitch IDs:
- Desktop f6b636977d7d40b89bd4048b696a4095
- Mobile 922867aec8474f11baff555043b86eea

Requirements:
- Soft aggregates already available on `/hq/reports` only — NO new generators, MoM %, forecasts, or fabricated KPIs
- Do not invent a separate performance route unless already registered
- Elevate PLACEHOLDER → PARTIAL chrome at most
- Preserve entitlement honesty from FG-08a / FG-Q12

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:reports-audit · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q13_HQ_BRANCH_PERFORMANCE.md
Suggested commit: Lift HQ reports hub presentation toward Stitch branch-performance chrome without new metrics.
Stop after this batch.
```

---

# WINDOW W5 — Product-gated (prompts 12–13)

## Window-reset prompt E

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W5 product-gated)

Continue on current V5 branch. Do not restore V4.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (W5 prompts only)

STOP CONDITIONS:
- Prompt 12 (prayer CTA): require explicit owner decision — link to /member/requests/new?category=prayer OR hide CTA. Do NOT invent /member/prayer-request.
- Prompt 13 (create-org): require explicit product unlock for UI. If CLI-only remains, skip and document skip in batch report.

Rules: no schema; no fake success; focused tests; stylelint changed CSS; git diff --check; one BATCH_*.md; stop after each batch.
Execute prompts 12 → 13 only after gates clear (otherwise skip with written note).
```

---

## Prompt 12 — FG-Q07 Member dashboard prayer CTA

**Package:** Foundation · **Status:** PARTIAL · **Queue:** FG-Q07 · **Product gate**

```text
IMPLEMENT FG-Q07 — Member dashboard prayer CTA

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q07)
- docs/gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md (#2)
- member/dashboard.ejs, member portal nav/routes (disabled tile), member-portal.css

Implement only: Member dashboard prayer quick-action decision (one screen).

Canonical Stitch IDs:
- Dashboard Desktop 4207a5a6a8ac4464b2b899695bbc7c78 · Mobile b315a9d1288b4454bcc37f79c25c5e10
- Prayer reference only Desktop 57edf48979d04b6d8647474961b48acb · Mobile 1dd180a3c5c5463988cb96dde2b44d37

Requirements (owner decision required before coding):
- Option A: link CTA to existing /member/requests/new?category=prayer
- Option B: keep CTA disabled/hidden with honest empty — no dead href
- Do NOT create /member/prayer-request or a prayer table
- Preserve member authz, CSRF, and existing request categories

Viewport: 375 / 768 / 1440 + 320px overflow
Test: npm run test:blessboard:member-portal · test:blessboard:forms-requests · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q07_MEMBER_PRAYER_CTA.md
Suggested commit: Point member prayer CTA at requests category or keep disabled with honest empty.
Stop after this batch.
```

---

## Prompt 13 — FG-Q06 Platform create organization UI

**Package:** Platform · **Status:** MISSING_GUI · **Queue:** FG-Q06 · **Product gate**

```text
IMPLEMENT FG-Q06 — Platform create organization UI

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q06)
- Existing platform-admin org list/detail + provisioning CLI patterns
- platformAdminRoutes.js / platform-admin templates/CSS

Implement only if product unlocks UI: Create organization screen (D+M pair) at /admin/organizations/new.

Canonical Stitch IDs:
- Desktop d992150d24cb4cd3afdca87ca3ce915f
- Mobile 0da4f454abf0402dbe09f82959f29afa

Requirements:
- If unlock is GET-form-only: do not invent unchecked provision POST behavior — wire only to existing safe provision paths if product specifies
- If still CLI-only: skip implementation; write batch report stating skip + reason; stop
- No fake org success, MRR, or Network auto-provision
- Preserve platform_admin authz and apex-only admin host rules
- Reuse platform-admin shell + design tokens

Viewport: 375 / 768 / 1440 + 320px overflow
Test: platform-admin shell / provisioning focused tests as applicable · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q06_CREATE_ORGANIZATION.md
Suggested commit: Add platform create-organization UI against Stitch pair using existing provision path only.
Stop after this batch (or after skip report).
```

---

# WINDOW W6 — Final parity audits (prompts 14–15)

## Window-reset prompt F

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W6 final audits)

Continue on current V5 branch. Do not restore V4.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/STITCH_SCREEN_MAP.md
- Read docs/gui/FOUNDATION_GROWTH_REMAINING_CURSOR_PROMPTS.md (W6 prompts only)

Rules: audit first; tiny confirmed visual fixes only; claim MATCHED only with side-by-side Stitch evidence; focused tests; stylelint changed CSS; git diff --check; one BATCH/audit doc per prompt; stop after each.

Execute prompts 14 → 15 last, after polish windows W1–W5 are done or explicitly skipped.
```

---

## Prompt 14 — FG-Q14 Responsive + a11y re-audit

**Package:** Both · **Status:** audit · **Queue:** FG-Q14

```text
IMPLEMENT FG-Q14 — Responsive + accessibility re-audit (FG surfaces)

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md (FG-Q14)
- Sample canonical pairs from completed FG-Q01–Q13 batches
- Shell CSS/JS and tests/blessboard-v5-a11y-structure.test.js

Implement only: confirmed responsive/a11y defect fixes on FG-touched surfaces (no redesign).

Canonical Stitch IDs: sample from completed FG-Q batches (list IDs audited in the batch report).

Requirements:
- Viewports 375 / 768 / 1440; static overflow at 320px
- Drawers: Escape, focus restore, aria-modal when open
- Touch targets ≥44px on primary nav; prefers-reduced-motion honored
- No route/auth/schema changes; no fabricated content

Test: npm run test:blessboard:a11y-structure · focused suites for touched portals · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG_Q14_RESPONSIVE_A11Y.md
Suggested commit: Harden FG Foundation/Growth surfaces for responsive and accessibility structure.
Stop after this batch.
```

---

## Prompt 15 — FG-Q15 Final Stitch parity audit (docs)

**Package:** Both · **Status:** audit · **Queue:** FG-Q15

```text
IMPLEMENT FG-Q15 — Final Stitch parity audit (documentation)

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_QUEUE.md
- docs/gui/STITCH_SCREEN_MAP.md
- docs/gui/FOUNDATION_GROWTH_BLOCKED_SCREENS.md
- Completed BATCH_FG_Q*.md reports from this program

Implement only: refresh coverage/queue/map statuses after FG-Q batches; tiny confirmed visual fixes only if blocking.

Canonical Stitch IDs: all FG-Q01–Q13 pairs plus COMPLETE Foundation/Growth rows (enumerate in report).

Requirements:
- Claim MATCHED only with live browser ↔ Stitch screenshot evidence
- No MATCHED without evidence
- Record remaining intentional differences and product gates
- Update FOUNDATION_GROWTH_SCREEN_COVERAGE.md status counts; do not invent backend

Test: git diff --check · smoke tests only if tiny visual fixes landed
Create: docs/gui/BATCH_FG_Q15_FINAL_PARITY_AUDIT.md
Suggested commit: Refresh Foundation/Growth Stitch coverage after remaining GUI batches.
Stop after this batch.
```

---

## Prompt index (quick)

| # | Queue | Screen | Package |
|---|-------|--------|---------|
| 1 | FG-Q01 | Apex Home | Platform |
| 2 | FG-Q02 | Pricing + FAQ | Platform |
| 3 | FG-Q03 | Directory | Platform |
| 4 | FG-Q04 | Register Church | Platform |
| 5 | FG-Q05 | For Churches | Platform |
| 6 | FG-Q08 | Ministry profile | Foundation |
| 7 | FG-Q09 | Announcement preview | Foundation |
| 8 | FG-Q10 | Website editor | Foundation |
| 9 | FG-Q11 | HQ content oversight | Growth |
| 10 | FG-Q12 | Giving report + gate | Growth |
| 11 | FG-Q13 | Branch performance | Growth |
| 12 | FG-Q07 | Member prayer CTA | Foundation (gated) |
| 13 | FG-Q06 | Create organization | Platform (gated) |
| 14 | FG-Q14 | Responsive/a11y audit | Both |
| 15 | FG-Q15 | Final parity audit | Both |
