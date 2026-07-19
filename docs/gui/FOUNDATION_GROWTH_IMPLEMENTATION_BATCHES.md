# Foundation & Growth — GUI implementation batches

**Date:** 2026-07-19  
**Companion:** [`FOUNDATION_GROWTH_SCREEN_COVERAGE.md`](../product/FOUNDATION_GROWTH_SCREEN_COVERAGE.md) · [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md)  
**Constraint:** Presentation / EJS / CSS batches unless a batch explicitly requires a tiny product decision. **No** schema, auth, session, hostname, or billing changes in these batches.  
**Rule:** One screen, one D+M pair, or max two closely related screens per batch.

Only **GUI-ready** gaps are batched. Backend-blocked / DEFERRED / NOT_IN_SCOPE items are listed in §Out of batch scope.

---

## Recommended first five (execute in order)

| # | Batch ID | Why first |
|---|----------|-----------|
| 1 | **FG-01** Apex Features | Route exists; high marketing visibility; Foundation commercial surface |
| 2 | **FG-02** Apex Pricing + FAQ | Pricing SoT already in code; Stitch polish |
| 3 | **FG-03** Apex Directory | Catalogue-backed; closes map “MISSING” drift |
| 4 | **FG-04** Apex Register Your Church | Enquiry-only; no provision invention |
| 5 | **FG-05** Branch ministry profile | PLACEHOLDER → PARTIAL; content admin already OK |

Then: FG-06 announcement preview · FG-07 For Churches · FG-08 HQ reports chrome · FG-09 member prayer CTA decision · FG-10 media Stitch adaptation.

---

## Batch FG-01 — Apex Features

| Field | Value |
|-------|-------|
| Package | Platform / Foundation commercial |
| Screens | Features |
| Stitch IDs | D `7ef3518f23a0400098d810f617dd0cc0` · M `5ac1e1b0600b4bc78f945e36b56aaece` |
| Routes | `/features` |
| Templates | Apex Features render path (`renderFeaturesPage` / apex EJS) |
| Backend readiness | **Ready** — route registered in `apexMarketingRoutes.js` |
| Files likely | `src/blessboard/http/renderApexMarketing.js` (or equiv), `views/blessboard/v5/apex/*`, `public/blessboard/v5/apex.css`, `apex-shell-*` |
| Tests | `npm run test:blessboard:apex-marketing` · `apex-home` if shared shell |
| Stop conditions | No checkout; no invented metrics; no auth changes |
| Suggested commit | `Polish apex Features page to canonical Stitch desktop/mobile pair.` |

---

## Batch FG-02 — Apex Pricing (+ FAQ)

| Field | Value |
|-------|-------|
| Package | Platform / Foundation commercial |
| Screens | Pricing; Pricing Details & FAQ (same `/pricing` surface) |
| Stitch IDs | D `1c50e898…` / `c47840e7…` · M `181ec1f8…` / `65067eb3…` |
| Routes | `/pricing` |
| Templates | Apex pricing EJS |
| Backend readiness | **Ready** — `platformPricingContent` / catalogue SoT |
| Files likely | pricing render, `apex.css`, pricing content module |
| Tests | `test:blessboard:apex-marketing` |
| Stop conditions | **No** payment UI; show Foundation/Growth/Network only; ignore Stitch four-tier decorative prices |
| Suggested commit | `Align apex Pricing and FAQ chrome with approved package SoT and Stitch.` |

---

## Batch FG-03 — Apex Church Directory

| Field | Value |
|-------|-------|
| Package | Platform |
| Screens | Church Directory |
| Stitch IDs | D `2b9df962f4ff4b4e8a45be51f99a5497` · M `ab5d47e2d6c54065a4eb66c906d3c39c` |
| Routes | `/directory` |
| Templates | Apex directory EJS |
| Backend readiness | **Ready** — hostname catalogue query |
| Files likely | directory handler in apex marketing, `apex.css` |
| Tests | `apex-marketing` |
| Stop conditions | No UUIDs/secrets; no fake orgs; prefer live testing labels only |
| Suggested commit | `Polish apex Directory against canonical BlessBoard Stitch pair.` |

---

## Batch FG-04 — Apex Register Your Church

| Field | Value |
|-------|-------|
| Package | Platform |
| Screens | Register Your Church |
| Stitch IDs | D `8640e8531e7144c3a048617592979cb7` · M `515da582d2504feaaa00c03b7a2e77e1` |
| Routes | `/register-church` |
| Templates | Apex register-church EJS |
| Backend readiness | **Ready for enquiry UI only** — no org provision POST |
| Files likely | register-church render, `apex.css` |
| Tests | `apex-marketing` |
| Stop conditions | **No** self-serve provisioning; no fake “request sent” success without product mailer |
| Suggested commit | `Polish Register Your Church enquiry layout to Stitch without adding provision.` |

---

## Batch FG-05 — Branch ministry profile

| Field | Value |
|-------|-------|
| Package | Foundation |
| Screens | Ministry profile (admin) |
| Stitch IDs | D `064769bb18ab455fb2a39adf2f3c080a` · M `17509b0d718346daaf4ac3b6c6f29d42` |
| Routes | `/branch-admin/content/ministries` entity fields (existing) |
| Templates | `content-admin/entity-fields.ejs` (+ ministries list chrome) |
| Backend readiness | **Ready** — entity CRUD exists |
| Files likely | `entity-fields.ejs`, `content-admin` CSS, maybe entities list |
| Tests | `test:blessboard:content-admin` |
| Stop conditions | No departments/duty roster/KPI invention; existing fields only |
| Suggested commit | `Elevate branch ministry entity editor toward Stitch ministry profile chrome.` |

---

## Batch FG-06 — Branch announcement preview polish

| Field | Value |
|-------|-------|
| Package | Foundation |
| Screens | Announcements admin preview (tight with list/form already PARTIAL) |
| Stitch IDs | D `65941542c13048edb2c62bccd01ddcea` · M `daa416025c704a5693b295ef3139af89` |
| Routes | `/branch-admin/announcements` (+ preview path if present) |
| Templates | `announcements/admin-*.ejs` |
| Backend readiness | **Ready** — no schedule |
| Files likely | admin-preview/publish EJS, announcements CSS |
| Tests | `test:blessboard:announcements` |
| Stop conditions | No SMS/scheduling; no fabricated delivery metrics |
| Suggested commit | `Polish branch announcement preview chrome to Stitch management pair.` |

---

## Batch FG-07 — Apex For Churches

| Field | Value |
|-------|-------|
| Package | Platform |
| Screens | For Churches |
| Stitch IDs | D `fc4bf5aab5bb4737a56d72030bae8803` · M `55af3450069944598d9f0ce17df12da6` |
| Routes | `/for-churches` |
| Templates | Apex marketing |
| Backend readiness | **Ready** |
| Files likely | for-churches render, `apex.css` |
| Tests | `apex-marketing` |
| Stop conditions | No Network-only claims as self-serve; match pricing decision copy |
| Suggested commit | `Polish For Churches marketing page to canonical Stitch pair.` |

---

## Batch FG-08 — HQ advanced reports chrome

| Field | Value |
|-------|-------|
| Package | Growth (advanced reports); Foundation sees basic hub |
| Screens | Reports hub + attendance/giving report presentation (max two: hub + one detail, or attendance+giving as pair) |
| Stitch IDs | Consolidated analytics `2a577dc15d4342acb152f16aed21c267` / `06489c79d0d04a429e57eba5c717ba47`; performance `f6b63697…` as reference only |
| Routes | `/hq/reports`, `/hq/reports/attendance`, `/hq/reports/giving` |
| Templates | `hq/reports.ejs`, `attendance-report.ejs`, `giving-report.ejs` |
| Backend readiness | **Ready** — `advanced_reports` soft gate already |
| Files likely | HQ report EJS, `hq-admin.css` |
| Tests | `test:blessboard:reports-audit` |
| Stop conditions | No new generators, CSV dumps, donor PII, forecasts; do not weaken entitlement gate |
| Suggested commit | `Align HQ attendance and giving report presentation with Stitch analytics chrome.` |

**Split rule:** Prefer **FG-08a** hub+attendance, **FG-08b** giving if scope grows.

---

## Batch FG-09 — Member prayer CTA (product-gated)

| Field | Value |
|-------|-------|
| Package | Foundation |
| Screens | Member dashboard prayer action → requests |
| Stitch IDs | Prayer `57edf489…` / `1dd180a3…` (reference); dashboard `4207a5a6…` |
| Routes | Keep `/member/requests/new?category=prayer` **or** hide CTA — **no** new `/member/prayer-request` without schema decision |
| Templates | `member/dashboard.ejs`, `memberPortalNav.js` / routes disabled tile |
| Backend readiness | **Ready** if linking to existing requests; **blocked** if dedicated route required |
| Files likely | `memberPortalRoutes.js`, `memberPortalNav.js`, dashboard EJS |
| Tests | `member-portal`, `forms-requests` |
| Stop conditions | Do not invent prayer table; do not enable dead href |
| Suggested commit | `Point member prayer CTA at requests category or keep disabled with honest empty.` |

**Owner decision required before coding.**

---

## Batch FG-10 — Media library chrome

| Field | Value |
|-------|-------|
| Package | Foundation |
| Screens | Media picker / upload / detail |
| Stitch IDs | Shared UI States `b61a1ea8176648408211b681e942e0a6` (no dedicated media pair) |
| Routes | `/branch-admin/content/media`, `/hq/content/media` |
| Templates | `media-upload.ejs`, picker CSS/JS |
| Backend readiness | **Ready** |
| Files likely | `media-picker.css`, upload EJS, detail archive confirm |
| Tests | `test:blessboard:media` |
| Stop conditions | Soft-archive only; no hard delete; no Unsplash; church scope |
| Suggested commit | `Tighten media picker and detail chrome to Shared UI States patterns.` |

---

## Cursor Agent window schedule

| Window | Batch | Est. focus | Notes |
|--------|-------|------------|-------|
| 1 | FG-01 Features | 1 screen D+M | Browser vs Stitch |
| 2 | FG-02 Pricing | Pricing + FAQ anchors | Commercial SoT |
| 3 | FG-03 Directory | 1 screen | Safe labels only |
| 4 | FG-04 Register Church | 1 screen | Enquiry only |
| 5 | FG-05 Ministry profile | 1 screen | Content-admin tests |
| 6 | FG-06 Announcement preview | 1 module polish | — |
| 7 | FG-07 For Churches | 1 screen | — |
| 8 | FG-08a HQ reports | Hub + attendance | Entitlement intact |
| 9 | FG-08b Giving report | 1 screen | Optional same day only if 08a clean |
| 10 | FG-09 | After product decision | Skip if deferred |
| 11 | FG-10 Media | Shared states | — |

**Do not** combine apex + branch admin in one window.  
**Do not** start DEFERRED Growth modules (surveys, schedules, offline) in these windows.

---

## Out of batch scope (do not schedule as GUI polish)

| Item | Reason |
|------|--------|
| Waiting verification | MISSING_BACKEND |
| Dedicated prayer route/table | MISSING_BACKEND |
| Departments / duty roster / monthly reports | MISSING_BACKEND |
| Scheduled comms/reports | DEFERRED |
| Offline attendance / surveys / appointments / volunteers | DEFERRED |
| Leader portal | NOT_IN_SCOPE |
| Network domain/email/API | NOT_IN_SCOPE |
| Banking / payment / QR checkout | NOT_IN_SCOPE |
| Wire `max_branches` into provision | Backend/ops batch — not GUI |
| Plan-key migration | Separate migration program |

---

## Stop conditions (all batches)

1. No schema / migration / auth / session / routing-mode changes.  
2. No fabricated KPIs, billing, or payment collection.  
3. No Network features sold as Growth.  
4. No V4 route ports.  
5. Focused tests only; stop if authz or entitlement tests fail.  
6. Bump CSS `?v=` when shell CSS changes.
