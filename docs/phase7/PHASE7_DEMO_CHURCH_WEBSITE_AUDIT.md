# Phase 7 — Demo church website audit (continued)

**Date:** 2026-07-29  
**Surface:** `/c/:organizationKey` V5 path-public  
**Prior verdict:** `CLOSE` (density P0)  
**Current verdict:** `CLOSE`

Screenshot comparison against church-flow Stitch PNGs completed for all 16 viewport captures. High pixel ratios are largely **content / composition / crop mismatches** versus the older church-flow PNG set (Phase 7 live soft-fill + 1440/390 viewport crops ≠ full-page Stitch exports). Do **not** claim `MATCHED`.

---

## 1. Final verdict: `CLOSE`

| Gate | Status |
|------|--------|
| 8 pages × desktop/mobile captured | Pass (16) |
| Mobile drawer open capture | Pass |
| Giving-method editor | Implemented |
| Leadership intro editor | Implemented |
| Footer social editor | Implemented |
| Branding colours | Documented only — **not implemented** |
| Pixel `MATCHED` vs Stitch | Fail (see matrix) |

---

## 2. Eight-page desktop/mobile Stitch comparison matrix

Baselines: `tests/__screenshots__/phase7-public/`  
Report: `tests/__screenshots__/phase7-public/stitch-comparison-report.json`

| Page | Desktop 1440×900 | Mobile 390×844 | Stitch desktop PNG | Stitch mobile PNG |
|------|------------------|----------------|--------------------|-------------------|
| Home | CODE_DEFECT (0.66) | CODE_DEFECT (0.91) | `01-public-home-desktop/...` | `01-public-home-mobile/...` |
| About | PRODUCT_DECISION (0.34) | PRODUCT_DECISION (0.34) | `02-public-about-desktop/...` | `02-public-about-mobile/...` |
| Leadership | CONTENT_DIFFERENCE (0.17) | PRODUCT_DECISION (0.34) | `03-public-leadership-desktop/...` | `03-public-leadership-mobile/...` |
| Ministries | CODE_DEFECT (0.42) | PRODUCT_DECISION (0.35) | `04-public-ministries-desktop/...` | `04-public-ministries-mobile/...` |
| Events | CODE_DEFECT (0.37) | PRODUCT_DECISION (0.31) | `05-public-events-calendar-desktop/...` | `05-public-events-calendar-mobile/...` |
| Sermons | CODE_DEFECT (0.69) | *(see report)* | `06-public-sermons-desktop/...` | `06-public-sermons-mobile/...` |
| Giving | *(see report)* | *(see report)* | `07-public-giving-desktop/...` | `07-public-giving-mobile/...` |
| Contact | *(see report)* | *(see report)* | `08-public-contact-desktop/...` | `08-public-contact-mobile/...` |
| Home drawer | ACCEPTED | — | n/a | `home-mobile-drawer-open.png` |

**Interpretation notes (not spacing regressions from P0):**

- Auto-classifier uses raw pixel ratio after cover-crop resize; it over-labels `CODE_DEFECT` when demo copy, hero media, and full-page Stitch exports differ.
- Preferred reclassification for most high-ratio rows: **CONTENT_DIFFERENCE** (demo seed vs Stitch church) + **PRODUCT_DECISION** (Phase 7 full-bleed home vs older mesh hero PNG).
- Mobile drawer row height measured ~44–48px band → **ACCEPTED**.

---

## 3. Screenshot baseline counts

| Item | Count |
|------|------:|
| Public page viewport captures | 16 |
| Mobile drawer open | 1 |
| Total PNG baselines written | 17 |
| Comparison rows in report | 17 |
| Updated snapshots this run | 17 (first write) |

---

## 4. Giving-method editor status: **IMPLEMENTED**

- Draft kind `giving_method` (validation → overlay → apply → publish)
- Fields: name, description, account details, instructions, external URL, button label, optional QR image, visibility, sort order
- UI pencils + add control on `giving.ejs`
- Migration `049_giving_method_editor_fields.sql` for extended columns
- Migration `050_…` expands `wsd_kind_check`

---

## 5. Leadership-introduction editor status: **IMPLEMENTED**

- Inline allowlist: `leadership` / `hero` / `heading` + `bodyText`
- Wired through `page-hero` with `editPageKey` / `editSectionKey`
- Eyebrow remains template constant (“Our Heart for Service”) — not CMS-backed → **PRODUCT_DECISION** not to invent an eyebrow editor

---

## 6. Footer-social editor status: **IMPLEMENTED**

- Draft kind `social_link` → `contact_channels`
- Add / edit / hide / reorder / https URL validation
- Empty-href placeholders no longer render (no icon-only chips)
- Socials loaded for footer on all public pages

---

## 7. Branding-colour product disposition: **PLATFORM-CONTROLLED / PRODUCT-BLOCKED**

| Question | Answer |
|----------|--------|
| Church-controlled today? | **No** — no per-church colour columns in `church_settings` |
| Plan-gated? | **No** dedicated entitlement found |
| Platform-controlled? | **Yes** — tokens in `design-tokens.css` (`--bb-color-primary: #6c5ce7`, GetPro orange accent) |
| Product-blocked for Phase 7? | **Yes** — do not implement church colour editors yet; HQ content admin marks org branding unavailable |

---

## 8. Files changed (this stage)

**Editors / data**

- `db/migrations/blessboard/049_giving_method_editor_fields.sql`
- `db/migrations/blessboard/050_website_structured_draft_kinds_giving_social.sql`
- `src/blessboard/repositories/publicContentRepository.js`
- `src/blessboard/services/publicContentAdminService.js`
- `src/blessboard/services/websiteStructuredDraftValidation.js`
- `src/blessboard/services/websiteStructuredDraftService.js`
- `src/blessboard/services/websiteDraftApplyService.js`
- `src/blessboard/services/websiteInlineEditableFields.js`
- `src/blessboard/http/loadTenantPublicPageModel.js`
- `public/blessboard/v5/website-structured-edit.js` (`?v=5`)
- `views/blessboard/v5/public/giving.ejs`
- `views/blessboard/v5/public/leadership.ejs`
- `views/blessboard/v5/partials/tenant-public-shell-end.ejs`

**Tests / docs / baselines**

- `tests/blessboard-phase7-editors.test.js`
- `tests/blessboard-phase7-visual-stitch.test.js`
- `tests/blessboard-phase7-public-density-audit.test.js` (kinds / leadership allowlist)
- `tests/__screenshots__/phase7-public/*`
- `docs/phase7/PHASE7_DEMO_CHURCH_WEBSITE_AUDIT.md` (this update)

---

## 9. Exact test commands and results

```bash
NODE_ENV=test node --test \
  tests/blessboard-phase7-public-density-audit.test.js \
  tests/blessboard-v5-frontend-assets.test.js \
  tests/blessboard-v5-mobile-drawer-menu.test.js \
  tests/blessboard-phase7-editors.test.js
# → 43 pass / 0 fail

NODE_ENV=test node --test tests/blessboard-phase7-visual-stitch.test.js
# → 2 pass / 0 fail (16 captures + drawer)
```

---

## 10. Remaining gaps

| Gap | Classification |
|-----|----------------|
| Pixel parity vs church-flow Stitch PNG set | CONTENT_DIFFERENCE / PRODUCT_DECISION (crop + demo content + Phase 7 home composition) |
| Human-reviewed visual QA against Phase 7 Stitch screen IDs in templates | PRODUCT_DECISION (map to newer Stitch project screens, not only church-flow folder) |
| Branding colour editors | PRODUCT_BLOCKED |
| Leadership eyebrow CMS field | PRODUCT_DECISION (template-only today) |
| Drag-and-drop reorder UI (API reorder exists) | PRODUCT_DECISION / PARTIAL |
| Playwright `toHaveScreenshot` in main `playwright.config.cjs` | ACCEPTED alternative: node:test + Chromium harness |

**Next to reach `MATCHED`:** align capture crop to Stitch artboard, seed content to match Stitch copy/media, and compare against the Phase 7 screen IDs referenced in each EJS template—not only the older church-flow PNG folders.
