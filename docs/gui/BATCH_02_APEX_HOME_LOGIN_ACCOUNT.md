# Batch 02 — Apex Home, Login, Account

**Date:** 2026-07-18  
**Scope:** Apex shell + `/`, `/login`, `/account` only  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md)

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Apex Home | `46081ff8f3d04090b9de33020bdf1530` | `9f9927a608024e4ebaae11f13e68bdc5` | BlessBoard - One digital home for your church (Desktop/Mobile) |
| Apex Login | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` | `09-auth-member-login-desktop` / `09-auth-member-login-mobile` |
| Apex Account | — | — | **STITCH_MISSING** — no dedicated Stitch pair in MCP inventory |

**Note:** Mobile home HTML currently diverges in copy (“Empower Your Community…”) from the desktop “One digital home…” frame, despite the shared Stitch title. V5 uses the **desktop** marketing narrative for both viewports (responsive stack), documented below.

## 2. V5 routes and templates changed

| Route | Method | Template / assets |
|-------|--------|-------------------|
| `/` (apex) | GET | `views/blessboard/v5/apex/home.ejs` |
| `/login` | GET/POST | `views/blessboard/v5/apex/login.ejs` |
| `/account` | GET | `views/blessboard/v5/apex/account.ejs` |
| `/logout` | POST | unchanged target (shell + account forms) |

**Shell / CSS / JS**

- `views/blessboard/v5/partials/apex-shell-start.ejs`
- `views/blessboard/v5/partials/apex-shell-end.ejs`
- `views/blessboard/v5/partials/apex-nav-links.ejs`
- `public/blessboard/v5/apex.css` (`?v=3`)
- `public/blessboard/v5/apex-auth.css` (`?v=3`)
- `public/blessboard/v5/apex.js` (`?v=2`)
- `src/blessboard/http/renderTenantLandingPage.js` — presentation locals only (`roleBadges`)

**Preserved backend:** form fields `email`, `password`, `_csrf`; POST `/login`; POST `/logout`; CSRF cookies; session/redirect/throttle behavior; no new routes.

## 3. Desktop comparison notes

| Surface | Stitch | V5 after Batch 2 |
|---------|--------|------------------|
| Home hero | Two-column copy + inset image (slight rotate) | Matched structure; local hero photos |
| Home CTAs | Register Your Church / Watch the Demo | **Login** / **Explore capabilities** (existing routes / in-page anchor) |
| Home nav | Features / Solutions / Find a Church / About + Register | **Home** + header **Login** only |
| Home sections | Audience → Capabilities → CTA band | Same order; Stitch-aligned short audience copy |
| Login | Centered tenant “Member Access” card, email-or-phone, Forgot password, Register | Apex **dual-pane** (V5 transfer auth); email+password only; no forgot/register |
| Account | No Stitch | Auth card + role badges + optional church/branch access cards |

## 4. Mobile comparison notes

| Surface | Notes |
|---------|-------|
| Home | Stacks two-column hero; drawer for Home/Login; 44px targets |
| Login | Dual-pane collapses via existing `tenant-auth.css`; card with logo mark |
| Account | Single card, full-width logout |
| Overflow | Container/gutter + flex min-width:0; CTA buttons full-width under 375px |

## 5. Image asset mapping

| Usage | Source path | Origin |
|-------|-------------|--------|
| Brand mark | `/church/images/brand/blessboard-small-church-logo.png` | Repo brand asset |
| Home hero (desktop) | `/church/images/homepage/desktop-hero-auditorium.jpg` | Existing homepage set |
| Home hero (mobile ≤767) | `/church/images/homepage/apex-hero-mobile.jpg` | Existing homepage set |
| Feature cards | `apex-feature-website.jpg`, `engagement.jpg`, `admin.jpg`, `multibranch.jpg` | Existing homepage set |

No new remote runtime image URLs. Stitch `lh3.googleusercontent.com` assets were inspected for composition only — not hotlinked.

## 6. Intentional differences from Stitch

1. Nav omits unimplemented marketing routes (no dead links).  
2. Hero CTAs map to Login/Account + `#capabilities` instead of Register / Watch Demo.  
3. CTA band omits fabricated “hundreds/500 churches” claims.  
4. Login remains apex dual-pane transfer auth (not tenant-branded centered password UI).  
5. Login field is **email** (V5), not “Email or Phone Number”.  
6. No Forgot password / Register as Member / social login.  
7. Mobile home uses desktop narrative (mobile Stitch HTML divergence).  
8. Account has no Stitch target — Sacred Modernity + auth card chrome.

## 7. Unsupported Stitch functionality omitted

- `/features`, `/pricing`, `/directory`, `/for-churches`, `/register-church`
- Forgot-password / password-reset / waiting-verification
- Social login
- Demo video
- Newsletter signup / social footer clusters
- Account editing, avatar, billing, notifications, password change

## 8. Accessibility checks

- Skip link → `#bb-apex-main` / login form  
- One `h1` per page  
- Drawer: `role="dialog"`, `aria-modal`, Escape, focus restore, Tab cycle (`apex.js`)  
- Login errors: `role="alert"`, `aria-live="assertive"`, field `aria-invalid`  
- Visible `:focus-visible` on header/nav/buttons  
- `prefers-reduced-motion` disables hero frame rotate / backdrop blur motion  
- Decorative images: empty `alt` on feature cards; meaningful `alt` on hero photo  

## 9. Tests and exact results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:design-system` | 8/8 pass |
| `npm run test:blessboard:a11y-structure` | 15/15 pass |
| `npm run test:blessboard:apex-home` | 3/3 pass |
| `npm run test:blessboard:apex-auth-gui` | 4/4 pass |
| `node --test tests/blessboard-auth-http.test.js` | 10/10 pass (session, CSRF, `/account`, logout) |
| `npm run test:blessboard:authorization` | 16/16 pass |
| `npm run test:platform:sessions` | 3/3 pass |
| `npx stylelint public/blessboard/v5/apex.css public/blessboard/v5/apex-auth.css` | 0 errors (warnings only: `color-no-hex`) |
| `git diff --check` | clean |

## 10. Remaining gaps

- Account still **STITCH_MISSING** — needs a designed Stitch pair for true parity.  
- Apex marketing Batch **2b** routes still missing.  
- Login visual model will never pixel-match tenant Stitch mock while V5 apex transfer auth remains.  
- Hero uses local auditorium/sanctuary photos rather than Stitch remote community photo (composition matched; asset differs).  

**Recommended next batch:** Batch 3 — Tenant public shell, Home and About.
