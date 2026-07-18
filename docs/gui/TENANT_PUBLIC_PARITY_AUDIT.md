# BlessBoard V5 — Tenant public website parity audit

**Date:** 2026-07-18 (re-audit after Batches 03A–07C)
**Scope:** Shared shell · Home · About · Leadership · Ministries · Events · Sermons · Contact · Giving · Registration · Registration Submitted · Tenant authentication states
**Out of scope:** Member portal (not started)
**Constraint:** Presentation only. No routes, queries, schema, sessions, auth, or authorization changes. No fabricated content.

**Stitch project:** `projects/17124191473876947591`
**Canonical map:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 13–25) · [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md)
**Live CSS:** `tenant-public.css?v=25` · `tenant-auth.css?v=10` · `apex-auth.css?v=5`

## Status legend

| Classification | Meaning |
|----------------|---------|
| **CLOSE PARITY** | Composition, chrome, and tokens align with Stitch for supported V5 content; remaining diffs are intentional |
| **MINOR GAPS** | Small presentation diffs remain; do not block demo routing |
| **MATERIAL GAPS** | Layout/interaction model differs enough that Stitch is not a fair demo match |
| **BLOCKED BY DATA** | Stitch needs fields/workflows V5 does not support — omitted rather than faked |
| **BLOCKED BY ASSET** | No dedicated Stitch desktop/mobile pair for this V5 surface |

---

## 1. Audit method

1. Compared each live template + CSS against canonical Stitch desktop **and** mobile IDs (MCP `get_screen` for Home desktop/mobile + About desktop; batch docs + map for remaining pairs).
2. Measured typography, spacing, image crop, alignment, colors, borders, radii, responsive stacking.
3. Fixed **clear presentation** gaps only (title accent contrast, focus rings, sermon play overlap, heading semantics, nav density, radii, landmark nesting).
4. Responsive review at **320 / 375 / 768 / 1024 / 1440** (breakpoints: 320, 360, 640, 768, 900, 1200, 1440).
5. Accessibility: skip, focus-visible, headings, labels, drawer trap, reduced motion, contrast tokens.
6. Ran focused tenant-public GUI, auth, and security tests + stylelint on changed V5 CSS + `git diff --check`.

---

## 2. Presentation fixes in this re-audit

| Fix | Files |
|-----|-------|
| Restore ink + violet title accents (was violet-on-violet) | About mobile, Leadership, Ministries, Events heroes in `tenant-public.css` |
| Extend `:focus-visible` to sermon/contact/map/inline links | `tenant-public.css` |
| Featured sermon mobile play overlap → copy `padding-right` | `tenant-public.css` |
| Header CTA radius → `--bb-radius` | `.bb-tp-btn--sm` |
| Mid-width nav density (900–1199) | Smaller gap + link size; restore at 1200px |
| Leadership featured: role label → `<p>`; name sole `<h2>` | `leadership.ejs` |
| Contact channel labels → `<h3>` | `contact.ejs` |
| Home outer wrapper → `<div>` (avoid nested landmark) | `home.ejs` |
| Giving notice/disclaimer spacing tighten | `tenant-public.css` |
| Auth skip focus ring + privacy/error-list focus; micro-radii tokens | `tenant-auth.css` |
| Cache bumps | `?v=25` public · `?v=10` auth |

**Not changed (intentional / blocked):** fabricated Home widgets, About stats/video, category chips, calendar, sermon thumbnails/series, contact POST form, payment/QR, tenant password login, forgot-password, bottom-tab FAB, tenant logo field, Inter / alternate violet.

---

## 3. Shared tenant shell

| Item | Detail |
|------|--------|
| Templates | `tenant-public-shell-start.ejs` / `tenant-public-shell-end.ejs` |
| CSS / JS | `tenant-public.css?v=25`, `tenant-public.js`, design-system |
| Stitch | Embodied in public frames — no standalone shell screen |
| **Status** | **CLOSE PARITY** |

### Intentional shell deviations

1. Full V5 CMS nav (8 routes) vs Stitch short mock nav.
2. Mobile **drawer** vs Stitch bottom-tab / FAB.
3. BlessBoard mark + `publicName` (no tenant logo URL in schema).
4. Footer: Quick Links + contact + members + Powered by GetPro — no newsletter/social/Privacy route.
5. Sacred Modernity `#6C5CE7` + Hanken Grotesk.

### Shell consistency

| Page | Shared shell | CSS |
|------|--------------|-----|
| Home … Giving | Yes | `?v=25` |
| Register / Submitted | Auth layout | `tenant-auth.css?v=10` |
| Tenant `/login` | Redirect → apex transfer (no tenant password UI) | N/A |

---

## 4. Page-by-page classification

| Surface | Desktop Stitch | Mobile Stitch | Classification | Notes |
|---------|----------------|---------------|----------------|-------|
| Shared shell | (public frames) | (public frames) | **CLOSE PARITY** | Intentional nav/footer product diffs |
| Home `/` | `ead45db5be774baa9454412262096ffc` | `89177588fbf8405dbebd5747c38e19ce` | **CLOSE PARITY** + **BLOCKED BY DATA** | Hero + sections + explore; omits announcements/service times/prayer/member-count |
| About `/about` | `44492f6abbe849d0a8a89303ce83129b` | `3f0b8a5c30544d9495064df8d5f9e62e` | **CLOSE PARITY** + **BLOCKED BY DATA** | Accent contrast fixed; omits stats / Watch Our Story / impact / annual report |
| Leadership `/leadership` | `372faa60f8df4983b627db3cb5d35f9d` | `0f4e816fd64d4592bd3677fbde3b7544` | **CLOSE PARITY** | Flat `sort_order`; no Contact Pastor / role groups |
| Ministries `/ministries` | `f146cdccadb34ff3bd8b0b75a0450d15` | `d2fd7ecc586541d3beb5d0d3bed98d56` | **CLOSE PARITY** | No category chips / Join Team / schedules |
| Events `/events` | `6f618576f0304982bd239bfe04946e72` | `f58c416cbbd545429258d963b3a15b60` | **CLOSE PARITY** | List/featured only (calendar Stitch obsolete) |
| Sermons `/sermons` | `4f4995dc4ec84354ac80ed022a767ef3` | `96b380d4e47649c1bd7f05cabe9c3a1d` | **CLOSE PARITY** + **BLOCKED BY DATA** | No series/scripture/duration/thumbnail schema; play overlap fixed |
| Contact `/contact` | `ab93d842bf2e49caa838a1fd414eb35b` | `9cbad6aacb6246549913e275f228fa80` | **BLOCKED BY DATA** (form/hours); chrome **CLOSE PARITY** | No POST form; map only with lat/lng |
| Giving `/giving` | `59c8fdedf68a43e3a5d2384b0c2212df` | `a0616f23568c464a95eda9e317e2fa9d` | **BLOCKED BY DATA** (payments); chrome **CLOSE PARITY** | Info-only published methods |
| Registration `/register` | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` | **MINOR GAPS** + **BLOCKED BY DATA** | V5 fields only; no wizard/password/gender |
| Registration submitted | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` | **CLOSE PARITY** | Honest pending-review copy; no ID/SLA |
| Tenant login entry | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` | **MATERIAL GAPS** vs Stitch password card; transfer chrome **CLOSE PARITY** / **MINOR GAPS** | Tenant redirects to apex; dual-pane Member Access |
| Transfer failure / auth error | — | — | **BLOCKED BY ASSET** | Safe generic states; shares auth chrome |
| Waiting verification | `239beae5…` | `8e6e504f…` | product **MISSING** | No V5 route |
| Forgot password | `61a6861b…` | `f4bb9457…` | product **MISSING** | No V5 route |

### Consolidated labels (demo routing)

| Surface | Final label |
|---------|-------------|
| Shared shell | CLOSE PARITY |
| Home | CLOSE PARITY + BLOCKED BY DATA |
| About | CLOSE PARITY + BLOCKED BY DATA |
| Leadership | CLOSE PARITY |
| Ministries | CLOSE PARITY |
| Events | CLOSE PARITY |
| Sermons | CLOSE PARITY + BLOCKED BY DATA |
| Contact | BLOCKED BY DATA (form); chrome CLOSE |
| Giving | BLOCKED BY DATA (payments); chrome CLOSE |
| Registration | MINOR GAPS + BLOCKED BY DATA |
| Registration submitted | CLOSE PARITY |
| Tenant auth states | Transfer chrome CLOSE/MINOR; vs Stitch password card MATERIAL (product); auth-error BLOCKED BY ASSET |

---

## 5. Responsive results

| Width | Shell / public pages | Auth |
|-------|----------------------|------|
| **320px** | Overflow clip; reduced gutters; brand ellipsis; cards `min-width: 0` | Auth overflow guards |
| **375px** | Compact header 64px; drawer; stacked heroes/lists; mobile sermon play with padding | Single-column auth |
| **768px** | Two-column heroes/grids; hamburger until 900; footer multi-col | Approaching split near 900 |
| **1024px** | Desktop nav (denser gap); 2–4 col grids | Dual-pane panel |
| **1440px** | `--bb-max` + 2rem gutter; nav gap restored to 2rem | Dual-pane + 2-col name rows |

No horizontal-scroll regressions expected after clip + 320px guards.

---

## 6. Accessibility results

| Check | Result |
|-------|--------|
| Skip link | Public + auth; focus-visible rings |
| Landmarks | `header`, `main#bb-tp-main`, `footer`, drawer dialog; home no longer double-`<section>` |
| Headings | Featured leader name is sole `h2`; contact channel labels are `h3` |
| Labels | Form labels on register/login; aria-labels on media/actions |
| Focus | Extended to sermon/contact/map/auth privacy/error links |
| Keyboard drawer | Escape, Tab trap, `inert` |
| Contrast | Violet/white and ink on warm page; ghost-on-dark intentional |
| Reduced motion | Public + auth overrides present |

---

## 7. Security / product confirmations

- No routes, queries, schema, sessions, CSRF, transfer, or authorization changes in this audit.
- No fake CMS widgets, stats, hours, payment UI, or Stitch stock assets hotlinked.
- Tenant `/login` remains redirect-only; apex transfer never embeds raw tokens.
- Registration fields and POST target unchanged.

---

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:public-pages` | **29/29 pass** |
| `npm run test:blessboard:member-registration` | **13/13 pass** |
| `npm run test:blessboard:apex-auth-gui` | **4/4 pass** |
| `npm run test:blessboard:tenant-auth` | **13/13 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:platform:sessions` | **3/3 pass** |
| `npm run test:blessboard:a11y-structure` | **32/32 pass** |
| `npx stylelint` (changed V5 CSS) | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

---

## 9. Demo routing readiness

**Verdict: YES — ready for tenant public demo routing** (authoritative mode with published CMS content).

| Ready | Caveat |
|-------|--------|
| Shell + all public CMS pages | Demo shows published content only; empty states are honest |
| Registration + submitted | V5 field set, not Stitch wizard |
| Tenant login → apex transfer | Do not expect Stitch tenant password card |
| Contact / Giving | Info chrome only — no form/payments |

**Not ready / out of scope:** Member portal, waiting-verification, forgot-password.

---

## 10. Suggested commit message

```
Tighten tenant public Stitch parity: accents, focus, headings, and responsive chrome.
```
