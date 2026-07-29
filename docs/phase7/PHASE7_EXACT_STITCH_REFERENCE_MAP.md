# Phase 7 — Exact Stitch reference map

**Project:** GetPro Church Platform `17124191473876947591`  
**Surface:** V5 path-public `views/blessboard/v5/public/*` (`/c/:organizationKey`)  
**Date:** 2026-07-29  

Do **not** treat older `design-reference/stitch-screens/church-flow/01-public-website/*` PNGs as Phase 7 exact references. Those were removed from the visual suite as **WRONG_REFERENCE**.

## Summary

| Mode | Confirmed | Probable | Ambiguous | Missing |
|------|-----------|----------|-----------|---------|
| Desktop (8 pages) | **8/8** | 0 | 0 | 0 |
| Mobile (8 pages) | **1/8** (Home only) | 0 | 0 | **7/8** |

Exact Phase 7 mobile artboards for About, Leadership, Ministries, Events, Sermons, Contact, and Giving **do not exist** in the Stitch project (only Home + Editing Mode mobiles under “Phase 7 - Church Website *”).

## Page → screen map

| Page | Route | EJS template | Desktop Stitch screen ID | Mobile Stitch screen ID | Reference file | Confidence |
|------|-------|--------------|--------------------------|-------------------------|----------------|------------|
| Home | `/c/:key` | `views/blessboard/v5/public/home.ejs` | `25de9fa64884455b993abb051adb0d8a` | `b82eb087d4b84242aabead19c08eb717` | `design-reference/stitch-screens/phase7-exact/home-desktop/` + `home-mobile/` | **CONFIRMED** (both) |
| About | `/c/:key/about` | `about.ejs` | `3736c7550483404282d5ba9914962c40` | — | `phase7-exact/about-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Leadership | `/c/:key/leadership` | `leadership.ejs` | `4d525f9fbba9482f91fadc28ef650d13` | — | `phase7-exact/leadership-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Ministries | `/c/:key/ministries` | `ministries.ejs` | `5a52a893e0414bf6962a0c078808d124` | — | `phase7-exact/ministries-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Events | `/c/:key/events` | `events.ejs` | `a68314c0d6a34e0a824ad1a2b309c4ad` | — | `phase7-exact/events-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Sermons | `/c/:key/sermons` | `sermons.ejs` | `d85d37f3bba84ac48d8d3f24b01b2010` | — | `phase7-exact/sermons-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Contact | `/c/:key/contact` | `contact.ejs` | `28ba746495424a66a10cf5fb11916dec` | — | `phase7-exact/contact-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |
| Giving | `/c/:key/giving` | `giving.ejs` | `e4fe61fbb9eb4b0987ca150d078aa76c` | — | `phase7-exact/giving-desktop/` | Desktop **CONFIRMED**; mobile **MISSING** |

Source of IDs: EJS header comments + Stitch `list_screens` titles `Phase 7 - Church Website {Page} - Desktop|Mobile`.

## Candidates rejected (wrong / older)

| Candidate | Why rejected |
|-----------|----------------|
| `church-flow/01-public-website/0N-public-*` | Pre–Phase 7 church-flow set; not the screens cited in V5 public EJS |
| `01-public-home-desktop-v2` `ead45db5…` | Earlier refined home; superseded by Phase 7 `25de9fa6…` |
| Populated v2/v3/v4 public screens (e.g. `44492f6a…` About v3) | Different generation; not wired in Phase 7 EJS comments |
| Mobile `02-public-about-mobile`, `03-public-leadership-mobile`, etc. | Older church-flow mobiles; **no** matching Phase 7 mobile screen ID |

## Artboard / comparison normalization

| Screen ID | Title | Device | Declared artboard (Stitch) | Comparison viewport | Crop rule | Scroll | Nav state |
|-----------|-------|--------|----------------------------|---------------------|-----------|--------|-----------|
| `25de9fa6…` | Home Desktop | DESKTOP | 2560 × 10094 | **1280 × 900** (2560@2x logical) | Top viewport crop of HTML-rendered artboard | Top (y=0) | Header closed / default |
| `b82eb087…` | Home Mobile | MOBILE | 780 × 10222 | **390 × 844** (780@2x logical) | Top viewport crop | Top | Drawer **closed** |
| `3736c755…` | About Desktop | DESKTOP | 2560 × 9306 | 1280 × 900 | Top viewport | Top | Default |
| `4d525f9f…` | Leadership Desktop | DESKTOP | 2560 × 7830 | 1280 × 900 | Top viewport | Top | Default |
| `5a52a893…` | Ministries Desktop | DESKTOP | 2560 × 4690 | 1280 × 900 | Top viewport | Top | Default |
| `a68314c0…` | Events Desktop | DESKTOP | 2560 × 5342 | 1280 × 900 | Top viewport | Top | Default |
| `d85d37f3…` | Sermons Desktop | DESKTOP | 2560 × 5694 | 1280 × 900 | Top viewport | Top | Default |
| `28ba7464…` | Contact Desktop | DESKTOP | 2560 × 3612 | 1280 × 900 | Top viewport | Top | Default |
| `e4fe61fb…` | Giving Desktop | DESKTOP | 2560 × 6574 | 1280 × 900 | Top viewport | Top | Default |

### Screenshot source limitation (`STITCH_REFERENCE_BLOCKED` for MCP PNG)

Stitch MCP `screenshot.downloadUrl` returns **thumbnails** (~130×512), not full artboards. Full-fidelity references used by the suite are:

1. Exact screen **HTML** downloaded from Stitch (`*.html` beside each screen).
2. Playwright-rendered **viewport PNGs**: `viewport-1280x900.png` / `viewport-390x844.png`.

Do not compare:

- Full-page Stitch exports vs viewport captures
- Drawer-open mobile vs drawer-closed references
- Different record counts / hero media / text lengths without classifying as content/media

### Expected content composition (from Phase 7 HTML)

| Page | Notable composition |
|------|---------------------|
| Home D | Church name hero “Grace Community Church”; CTAs Plan Your Visit + Watch Latest Sermon; service times; welcome; ministries teasers |
| Home M | “WELCOME TO BLESSBOARD” / Sacred Modernity mobile composition (copy differs from desktop — product dual artboard) |
| About | “Our Story” / Roots of Connection long narrative |
| Leadership | Eyebrow “OUR HEART FOR SERVICE”; Senior Pastor card + executive team |
| Ministries | Ecosystem intro + ministry cards |
| Events | Featured summit + event cards |
| Sermons | Featured sermon + recent list |
| Contact | Get In Touch + visit/phone/email + form chrome |
| Giving | Generosity intro + give CTAs / methods |

## Deterministic visual fixture

- Module: `src/blessboard/services/phase7ExactVisualFixtureSpec.js`
- Applied only when visual suite passes `contentSpec` into `seedTestingWebsiteDemoContent` (testing env).
- Aligns church name, hero, leaders (3), ministries (4), events (3), sermons (3), contact, giving intro.
- **Media:** same-site demo images only → classify residual photo diffs as `MEDIA_DIFFERENCE` / `MEDIA_BLOCKED`.

## Ordering controls (Stage 6)

- Giving methods + footer socials: move-up / move-down preserved; drag-and-drop = **PRODUCT_ENHANCEMENT** (not required for public `MATCHED`).
- Branding colours remain **PLATFORM_CONTROLLED / PRODUCT_BLOCKED**.

## MATCHED gate

Cannot claim pixel `MATCHED` while:

1. Seven mobile exact Phase 7 screen IDs are **MISSING**.
2. MCP full-resolution PNG export remains thumbnail-only (`STITCH_REFERENCE_BLOCKED` for native PNG).
3. Media substitutions remain `MEDIA_BLOCKED`.

Verdict retained: **CLOSE** until mobile refs exist and remaining diffs are manually cleared of `CONFIRMED_CODE_DEFECT`.
