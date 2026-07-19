# Foundation & Growth — Cursor Agent prompts

**Date:** 2026-07-19  
**Mode:** Documentation only — no application code  
**Sources:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md`](./FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md) · [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md)

**Rule:** One prompt = one FG batch ≤ two tightly related screens. No project-history dumps. No schema/auth/session/hostname/billing changes unless a batch explicitly requires a tiny product decision.

---

## Status of FG schedule

| Batch | Coverage status | Prompt? |
|-------|-----------------|---------|
| **FG-01** Apex Features | PARTIAL (polished) | **Done** — `BATCH_FG01_APEX_FEATURES.md` — do not re-run |
| **FG-02** Apex Pricing + FAQ | PARTIAL | Prompt **1** |
| **FG-03** Apex Directory | PARTIAL | Prompt **2** |
| **FG-04** Apex Register Your Church | PARTIAL | Prompt **3** |
| **FG-05** Branch ministry profile | PLACEHOLDER | Prompt **4** |
| **FG-06** Announcement preview | PARTIAL | Prompt **5** |
| **FG-07** Apex For Churches | PARTIAL | Prompt **6** |
| **FG-08a** HQ hub + attendance | PARTIAL (gated) | **Done** — `BATCH_FG08A_HQ_REPORTS.md` — do not re-run |
| **FG-08b** HQ giving report | PARTIAL | Prompt **7** (Growth) |
| **FG-09** Member prayer CTA | PARTIAL / product gate | Prompt **8** |
| **FG-10** Media library | **MISSING_STITCH** | **Excluded** |
| PA Create organization | **MISSING_GUI** | **Excluded** — product/CLI only; not in FG GUI schedule |

**Excluded classes (no prompts):** `MISSING_BACKEND` · `MISSING_STITCH` · `DEFERRED` · `NOT_IN_SCOPE`

---

## Summary counts

| Metric | Count |
|--------|------:|
| Implementation prompts generated | **8** |
| Foundation / Platform commercial | **7** (prompts 1–6, 8) |
| Growth | **1** (prompt 7) |
| Window-reset prompts | **3** |
| Agent windows (≤4 batches each) | **3** |

---

## Excluded backend-blocked / deferred / out-of-scope (do not prompt)

| Item | Status |
|------|--------|
| Waiting / verification (member) | MISSING_BACKEND |
| Dedicated `/member/prayer-request` table/route | MISSING_BACKEND |
| Branch basic monthly reports (BA) | MISSING_BACKEND |
| Departments / duty roster | MISSING_BACKEND |
| Monthly report workflow (V4 port) | MISSING_BACKEND |
| HQ roles / templates UI | MISSING_BACKEND |
| Auth error / Account / BA forms / sermons admin / BA settings / media | MISSING_STITCH |
| Forgot password | DEFERRED |
| Scheduled communications / scheduled reports | DEFERRED |
| Offline attendance / surveys / appointments / volunteer scheduling | DEFERRED |
| Pastoral workflows beyond request categories | DEFERRED |
| Leader portal | NOT_IN_SCOPE |
| Network domain / email / API / webhooks | NOT_IN_SCOPE |
| Banking / QR / payment checkout | NOT_IN_SCOPE |

---

## Recommended Agent window schedule

| Window | Reset | Prompts (max 4) | Focus |
|--------|-------|-----------------|-------|
| **W1** | Reset A | 1–3 (FG-02, FG-03, FG-04) | Apex commercial |
| **W2** | Reset B | 4–6 (FG-05, FG-06, FG-07) | Branch Foundation + For Churches |
| **W3** | Reset C | 7–8 (FG-08b, FG-09) | Growth giving + member CTA |

Do **not** mix apex marketing with branch-admin in the same unfinished prompt.  
Do **not** start DEFERRED Growth catalogue modules.

---

# WINDOW W1 — Apex commercial

## Window-reset prompt A

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W1 Apex)

Continue on current V5 branch. Do not restore V4. Do not flip shadow/authoritative routing.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/FOUNDATION_GROWTH_CURSOR_PROMPTS.md (this window’s prompts only)

Rules for every batch in this window:
- Presentation/EJS/CSS only unless the batch says otherwise
- Max two tightly related screens
- Exact Stitch IDs from the prompt
- No fake KPIs, payments, Network-as-Growth, schema, auth, or session changes
- Focused tests only; create one docs/gui/BATCH_*.md; stop after that batch
- Bump CSS ?v= when shell CSS changes
- Commit only if explicitly asked

FG-01 and FG-08a are already done — skip them.
Execute prompts 1 → 2 → 3 in order. One batch per turn; stop after each batch completes.
```

---

## Prompt 1 — FG-02 Apex Pricing (+ FAQ)

**Package:** Foundation / Platform commercial · **Status:** PARTIAL

```text
IMPLEMENT FG-02 — Apex Pricing + FAQ

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-02)
- docs/product/BLESSBOARD_PRICING_DECISION.md
- docs/gui/BATCH_FG01_APEX_FEATURES.md (pattern only)
- Files directly involved in /pricing (apex EJS, apex.css, platformPricingContent / catalogue)

Implement only FG-02 screens:
1. Pricing
2. Pricing Details & FAQ (same /pricing surface, e.g. #faq)

Canonical Stitch IDs:
- Pricing D 1c50e8987d9043ec941b07fb0f67cef5 · M 181ec1f8076c4ae7ad6be92d5a4861f3
- FAQ D c47840e7030c449a94c4ce4a03fa932f · M 65067eb3ebfe45b2a810531334c54684

Requirements:
- Preserve backend: public apex GET only; no checkout/payment
- Show Foundation / Growth / Network only per pricing SoT — ignore decorative Stitch four-tier prices
- No fake church counts, billing amounts, or trial CTAs that invent product
- Reuse apex shell + Sacred Modernity tokens (Hanken / #6C5CE7)

Test focused: test:blessboard:apex-marketing · a11y-structure if markers · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG02_APEX_PRICING.md
Report: files, Stitch IDs, data shown, omitted unsupported, responsive, tests, gaps, suggested commit
Suggested commit: Align apex Pricing and FAQ chrome with approved package SoT and Stitch.
Stop after this batch.
```

---

## Prompt 2 — FG-03 Apex Church Directory

**Package:** Platform · **Status:** PARTIAL

```text
IMPLEMENT FG-03 — Apex Church Directory

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-03)
- Latest related batch docs if present (FG-01/FG-02 pattern)
- Files for /directory only

Implement only: Church Directory (D+M pair).

Canonical Stitch IDs:
- D 2b9df962f4ff4b4e8a45be51f99a5497
- M ab5d47e2d6c54065a4eb66c906d3c39c

Requirements:
- Catalogue-backed list only — no fake orgs
- No UUIDs/secrets in HTML; prefer live testing labels
- Preserve apex-only gate and existing query behavior
- No auth/schema changes

Test: test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG03_APEX_DIRECTORY.md
Suggested commit: Polish apex Directory against canonical BlessBoard Stitch pair.
Stop after this batch.
```

---

## Prompt 3 — FG-04 Apex Register Your Church

**Package:** Platform · **Status:** PARTIAL

```text
IMPLEMENT FG-04 — Register Your Church

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-04)
- Files for /register-church only

Implement only: Register Your Church (D+M pair).

Canonical Stitch IDs:
- D 8640e8531e7144c3a048617592979cb7
- M 515da582d2504feaaa00c03b7a2e77e1

Requirements:
- Enquiry UI polish only — NO self-serve org provision POST
- Do not fake “request sent” success without an existing product mailer path
- Preserve apex shell, SEO, a11y
- No auth/schema/billing

Test: test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG04_APEX_REGISTER_CHURCH.md
Suggested commit: Polish Register Your Church enquiry layout to Stitch without adding provision.
Stop after this batch.
```

---

# WINDOW W2 — Branch Foundation + For Churches

## Window-reset prompt B

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W2 Branch + For Churches)

Continue on current V5 branch. Do not restore V4. Do not flip routing modes.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/FOUNDATION_GROWTH_CURSOR_PROMPTS.md (W2 prompts only)

Rules: presentation only; ≤2 screens; exact Stitch IDs; no fake data; no Network features; focused tests; one BATCH_*.md; stop after each batch; bump CSS ?v= when needed.

W1 apex batches may already be done — do not redo unless broken.
Execute prompts 4 → 5 → 6 in order.
```

---

## Prompt 4 — FG-05 Branch ministry profile

**Package:** Foundation · **Status:** PLACEHOLDER

```text
IMPLEMENT FG-05 — Branch ministry profile

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-05)
- Existing content-admin entity fields / ministries files only

Implement only: Ministry profile admin chrome (entity-fields + related list chrome if tightly required).

Canonical Stitch IDs:
- D 064769bb18ab455fb2a39adf2f3c080a
- M 17509b0d718346daaf4ac3b6c6f29d42

Requirements:
- Existing entity fields only — no departments, duty roster, or KPI invention
- Preserve church/branch scoping and content-admin authz
- Reuse branch-admin shell + V5 design components
- Elevate PLACEHOLDER → PARTIAL presentation

Test: test:blessboard:content-admin · a11y-structure if needed · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG05_MINISTRY_PROFILE.md
Suggested commit: Elevate branch ministry entity editor toward Stitch ministry profile chrome.
Stop after this batch.
```

---

## Prompt 5 — FG-06 Branch announcement preview

**Package:** Foundation · **Status:** PARTIAL

```text
IMPLEMENT FG-06 — Branch announcement preview polish

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-06)
- announcements admin-* templates/CSS/routes involved in preview

Implement only: Announcements admin preview (list/form only if required for preview chrome).

Canonical Stitch IDs:
- D 65941542c13048edb2c62bccd01ddcea
- M daa416025c704a5693b295ef3139af89

Requirements:
- No SMS, scheduling, or fabricated delivery metrics
- Preserve publish-now behavior; do not add schedules unless already in V5
- Branch scope + authz intact

Test: test:blessboard:announcements · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG06_ANNOUNCEMENT_PREVIEW.md
Suggested commit: Polish branch announcement preview chrome to Stitch management pair.
Stop after this batch.
```

---

## Prompt 6 — FG-07 Apex For Churches

**Package:** Platform · **Status:** PARTIAL

```text
IMPLEMENT FG-07 — Apex For Churches

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-07)
- docs/product/BLESSBOARD_PRICING_DECISION.md
- Files for /for-churches only

Implement only: For Churches (D+M pair).

Canonical Stitch IDs:
- D fc4bf5aab5bb4737a56d72030bae8803
- M 55af3450069944598d9f0ce17df12da6

Requirements:
- No Network-only claims as self-serve Growth
- Match pricing decision copy; no checkout
- No invented metrics or enterprise sales fabrication

Test: test:blessboard:apex-marketing · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG07_APEX_FOR_CHURCHES.md
Suggested commit: Polish For Churches marketing page to canonical Stitch pair.
Stop after this batch.
```

---

# WINDOW W3 — Growth reports + member CTA

## Window-reset prompt C

```text
WINDOW RESET — BlessBoard V5 Foundation/Growth GUI (W3 Growth + Member)

Continue on current V5 branch. Do not restore V4. Do not flip routing modes.

Before any code:
- Read docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- Read docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md
- Read docs/gui/VISUAL_SYSTEM.md
- Read docs/gui/BATCH_FG08A_HQ_REPORTS.md (entitlement pattern — do not redo 08a)
- Read docs/gui/FOUNDATION_GROWTH_CURSOR_PROMPTS.md (W3 prompts only)

Rules: preserve advanced_reports entitlement; preserve Foundation hub; no fake forecasts/donor PII; no Network features; no new schema; focused tests; one BATCH_*.md; stop after each batch.

Execute prompts 7 → 8 in order. For prompt 8, confirm product decision before coding.
```

---

## Prompt 7 — FG-08b HQ giving report (Growth)

**Package:** Growth · **Status:** PARTIAL

```text
IMPLEMENT FG-08b — HQ giving report chrome (Growth)

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-08 / 08b)
- docs/gui/BATCH_FG08A_HQ_REPORTS.md
- docs/product/BLESSBOARD_PRICING_DECISION.md
- Files for /hq/reports/giving (+ hub card labels if tightly required)

Implement only:
1. Giving report presentation
2. Hub giving destination card entitlement labeling if required for consistency with FG-08a

Canonical Stitch IDs (consolidated analytics family):
- D 2a577dc15d4342acb152f16aed21c267
- M 06489c79d0d04a429e57eba5c717ba47
(Performance f6b636977d7d40b89bd4048b696a4095 / 922867aec8474f11baff555043b86eea = reference only)

Requirements:
- Confirm screen available only when advanced_reports allows (match FG-08a attendance gate pattern)
- Preserve Foundation hub; Foundation denial/fallback honest
- Preserve church/branch scoping; live aggregates only
- No donor PII, charts fabrications, CSV/PDF, forecasts, Network features
- Reuse HQ shell + hq-admin.css

Test: test:blessboard:reports-audit · Growth entitled + Foundation fallback · HQ authz · a11y-structure · stylelint changed CSS · git diff --check
Create: docs/gui/BATCH_FG08B_HQ_GIVING_REPORT.md
Suggested commit: Gate HQ giving report on Growth advanced_reports and align Stitch analytics chrome.
Stop after this batch.
```

---

## Prompt 8 — FG-09 Member prayer CTA (product-gated)

**Package:** Foundation · **Status:** PARTIAL (decision required)

```text
IMPLEMENT FG-09 — Member prayer CTA (product-gated)

OWNER DECISION REQUIRED BEFORE CODING (choose one):
A) Point dashboard prayer CTA to existing /member/requests/new?category=prayer
B) Keep CTA disabled / honest empty — do not invent a live href
Do NOT create /member/prayer-request or a prayer table.

Read only:
- docs/product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md
- docs/gui/VISUAL_SYSTEM.md
- docs/gui/FOUNDATION_GROWTH_IMPLEMENTATION_BATCHES.md (FG-09)
- member/dashboard.ejs, memberPortalNav / memberPortalRoutes as involved

Implement only: Member dashboard prayer action wiring/chrome (≤1 screen; requests form only if CTA target needs a tiny consistency tweak).

Canonical Stitch IDs:
- Dashboard D 4207a5a6a8ac4464b2b899695bbc7c78 · M b315a9d1288b4454bcc37f79c25c5e10
- Prayer reference only D 57edf48979d04b6d8647474961b48acb · M 1dd180a3c5c5463988cb96dde2b44d37 (do not build dedicated route)

Requirements:
- Preserve Foundation member authz and existing requests backend
- No fake unread/attendance KPIs
- No MISSING_BACKEND dedicated prayer surface

Test: test:blessboard:member-portal · test:blessboard:forms-requests · git diff --check
Create: docs/gui/BATCH_FG09_MEMBER_PRAYER_CTA.md
Suggested commit: Point member prayer CTA at requests category or keep disabled with honest empty.
Stop after this batch (or stop with decision note if owner has not chosen A/B).
```

---

## End of prompt pack

Next after W3: either revisit visual MATCHED claims for FG-01/08a, or a separate program for `MISSING_STITCH` / `MISSING_BACKEND` — **not** these FG GUI windows.
