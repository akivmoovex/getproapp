# Batch 02b — Apex marketing routes

**Date:** 2026-07-18  
**Scope:** `GET /features`, `/for-churches`, `/pricing`, `/directory`, `/register-church`  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_02_APEX_HOME_LOGIN_ACCOUNT.md`](./BATCH_02_APEX_HOME_LOGIN_ACCOUNT.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Features | `7ef3518f23a0400098d810f617dd0cc0` | `5ac1e1b0600b4bc78f945e36b56aaece` | BlessBoard - Features (Desktop/Mobile) |
| For Churches | `fc4bf5aab5bb4737a56d72030bae8803` | `55af3450069944598d9f0ce17df12da6` | BlessBoard - For Churches (Desktop/Mobile) |
| Pricing | `1c50e8987d9043ec941b07fb0f67cef5` | `181ec1f8076c4ae7ad6be92d5a4861f3` | BlessBoard - Pricing (Desktop/Mobile) |
| Pricing FAQ | `c47840e7030c449a94c4ce4a03fa932f` | `65067eb3ebfe45b2a810531334c54684` | BlessBoard - Pricing Details & FAQ (Desktop/Mobile) — rendered as `/pricing#faq` |
| Directory | `2b9df962f4ff4b4e8a45be51f99a5497` | `ab5d47e2d6c54065a4eb66c906d3c39c` | BlessBoard - Church Directory (Desktop/Mobile) |
| Register Church | `8640e8531e7144c3a048617592979cb7` | `515da582d2504feaaa00c03b7a2e77e1` | BlessBoard - Register Your Church (Desktop/Mobile) |

Obsolete IDs **not** used: `01-platform-church-finder-*`, older platform home frames.

## 2. Routes and files

| Route | Method | Status |
|-------|--------|--------|
| `/features` | GET | **Added** (apex-only) |
| `/for-churches` | GET | **Added** (apex-only) |
| `/pricing` | GET | **Added** (apex-only) |
| `/directory` | GET | **Added** (apex-only; uses existing public directory query) |
| `/register-church` | GET | **Added** (apex-only; enquiry presentation, no POST) |

**New / changed application files**

- `src/blessboard/http/apexMarketingRoutes.js`
- `src/blessboard/http/renderApexMarketing.js`
- `src/blessboard/http/apexMarketingContent.js`
- `src/platform/http/v5FoundationServer.js` (mount marketing router)
- `views/blessboard/v5/apex/features.ejs`
- `views/blessboard/v5/apex/for-churches.ejs`
- `views/blessboard/v5/apex/pricing.ejs`
- `views/blessboard/v5/apex/directory.ejs`
- `views/blessboard/v5/apex/register-church.ejs`
- `views/blessboard/v5/apex/home.ejs` (CTAs now include Register)
- `views/blessboard/v5/partials/apex-nav-links.ejs`
- `views/blessboard/v5/partials/apex-shell-start.ejs` (`apex.css?v=4`)
- `views/blessboard/v5/partials/apex-shell-end.ejs`
- `public/blessboard/v5/apex.css`
- `tests/blessboard-apex-marketing.test.js`
- `tests/blessboard-apex-home.test.js`
- `package.json` (`test:blessboard:apex-marketing`)

## 3. Text and image sources

| Surface | Text source | Images |
|---------|-------------|--------|
| Features | Stitch section titles + V5-safe capability copy | Local `apex-feature-*.jpg` |
| For Churches | Stitch hero/burden/toolkit/steps (sanitized) | Same local feature set |
| Pricing | `src/church/platformPricingContent.js` + curated FAQ from `platformFaqContent.js` | None (cards/FAQ) |
| Directory | Live org cards via `publicChurchDirectoryRepo` + Stitch empty chrome | None |
| Register | Stitch layout intent; enquiry copy only | None |

No remote runtime image URLs. Stitch screenshots inspected for composition only.

## 4. Real versus unavailable data

| Data | Status |
|------|--------|
| Pricing Free / Growth / Professional / Partner labels & amounts | **Real** — from `platformPricingContent.js` |
| FAQ answers | **Curated** — implemented-behavior subset only |
| Directory listings | **Real** when DB returns active public orgs (env filter excludes testing/demo on production deployments) |
| Directory Visit URL | **Real** `https://{branch}.…` for single-branch cards via `churchPublicUrl`; multi-branch has no `/churches/:slug` detail route |
| Register submission | **Unavailable** — no V5 public POST/inquiry workflow wired; enquiry state only |
| Checkout / subscription activation | **Unavailable** — omitted |
| Fabricated church counts / testimonials | **Omitted** |

## 5. Intentional deviations

1. Nav uses Home + five marketing routes (+ Account when signed in); omits Stitch “About / Solutions / Stewardship” labels that map to missing routes.
2. Features omits Stitch fabricated metrics (+12% attendance, $42k giving) and “Start Free Trial / Watch Product Tour”.
3. Custom domains, payment-gateway giving, SSO, and advanced analytics labeled as unavailable / by arrangement.
4. All pricing CTAs point to `/register-church` (no `/contact`).
5. Register Church is a **non-submitting enquiry** — no fake “Request Sent!” success.
6. Directory does not implement Stitch demo listings; empty state when no active orgs.
7. Growth billing catalogue (`USD 14.90`/branch) is **not** shown on marketing pricing — public catalogue in `platformPricingContent` remains the approved display SoT for this page.

## 6. Unsupported Stitch functionality omitted

- Checkout, Stripe, plan activation, free trial start
- Demo scheduling / product tour video
- Newsletter / social footer clusters / Privacy-Terms routes (not in Batch 2b)
- Register form POST, password creation, church provisioning
- Directory org detail pages (`/churches/:slug`)
- Forgot-password / prayer / SMS / drag-and-drop CMS claims

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:apex-marketing` | 7/7 pass |
| `npm run test:blessboard:apex-home` | 3/3 pass |
| `npm run test:blessboard:design-system` | 8/8 pass |
| `npm run test:blessboard:a11y-structure` | 15/15 pass |
| `npx stylelint public/blessboard/v5/apex.css` | 0 errors (hex warnings only) |
| `git diff --check` | clean |

## 8. Remaining gaps

- Register Church still needs a product-backed inquiry/provisioning workflow before Stitch form parity.
- Multi-branch directory visit path needs an approved V5 detail route or hostname selector.
- Align public pricing display with entitlement codes (`foundation`/`growth`) if product retires Free/Professional/Partner marketing names.
- Optional: export Stitch assets into `public/church/images` for closer hero imagery.

**Recommended next batch:** Batch 3 — Tenant public shell, Home and About.
