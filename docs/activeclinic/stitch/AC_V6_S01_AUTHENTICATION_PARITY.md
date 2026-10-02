# AC-V6-S01 — Authentication Stitch Parity

**Stage:** AC-V6-S01  
**Date:** 2026-08-03  
**Verdict:** `ACTIVECLINIC_V6_S01_AUTH_PARITY_PARTIAL`

Stitch MCP `get_screen` was unavailable (invalid argument). Visual source used: Stitch HTML + screenshots downloaded via `list_screens` file entry URLs for **P01 Login** only. Those URLs were **not** hotlinked in the app.

---

## Exact Stitch screens

| Exact Stitch name | Stitch ID | Form factor | Route | Status |
|---|---|---|---|---|
| P01 – Login – Desktop | `ca8a34cf1ecb4fefa2ed31fb9873ae45` | Desktop | `GET/POST /login` | **PARTIAL** (implemented; intentional deviations below) |
| P01 – Login – Mobile | `026f619c35b04a5c8dde16eca9f7cf35` | Mobile | `GET/POST /login` | **PARTIAL** (same responsive view) |
| Login - Desktop / Mobile | `8bf5c500…` / `6e3cbe49…` | — | — | **DUPLICATE** — not targeted |
| Shared Error / Loading / Access Restricted | inventory IDs | Desktop | lifecycle terminals | **PARTIAL** — tone/layout reused in `lifecycle-state`; not pixel-matched chrome |
| Org select, activate, forgot, reset, change-password | — | — | existing routes | **VISUAL_BLOCKED / STITCH_GAP** — shared auth shell only |

---

## Routes

Unchanged canonical routes: `/login`, `/login/select-organization`, `/activate/:token`, `/forgot-password`, `/reset-password/:token`, `/account/change-password`, `POST /logout`.

---

## Components

| Piece | Path |
|---|---|
| Auth CSS tokens | `public/activeclinic/ac-auth.css` |
| Auth JS (toggle / loading) | `public/activeclinic/ac-auth.js` |
| Auth shell layout | `views/activeclinic/layouts/auth-shell.ejs` |
| Login / org / activate / forgot / reset / change-password / lifecycle-state | `views/activeclinic/auth/*.ejs` |
| Partials | `views/activeclinic/partials/auth-*.ejs` |
| Render + view models | `src/activeclinic/http/renderActiveClinicAuth.js` |

Temporary inline HTML layouts from AC-V6-08/09 auth/lifecycle routes were replaced.

---

## Desktop / mobile

- Desktop ≥768px: split card (brand panel + form) matching P01 Login composition.
- Mobile: brand panel hidden; centered card with mark + ActiveClinic + supporting name (P01 mobile pattern).
- Lifecycle / org / password pages: single-card auth shell (`data-ac-visual="stitch-gap"`).

---

## Backend behavior preserved

Phone-first + email login, generic errors, org selection transfer, activation/reset one-time tokens, CSRF, rate limits, must-change-password gate, ActiveClinic cookie isolation, BlessBoard independence. No mock authentication.

Locked identity surfaces a safe “temporarily locked” message when `failureCategory === account_locked` (still no account enumeration for unknown identifiers).

---

## Accessibility

- `main` landmark, H1 per page, associated labels  
- `autocomplete` username / current-password / new-password  
- Error summary with `role="alert"` + focus script on login errors  
- Password toggle `aria-label` / `aria-pressed`  
- Touch-sized controls; reduced-motion respected in CSS  

---

## Security

- CSRF on all POSTs  
- Passwords never repopulated  
- Tokens only in route path where browser already has them  
- No permission keys / identity IDs on public pages  
- Logout remains POST  
- Safe `next` path allowlist unchanged  

---

## Intentional differences vs Stitch

1. **Typography:** Hanken Grotesk (product) instead of Plus Jakarta Sans / Inter.  
2. **Identifier label:** “Phone number or email” (product rule) vs Stitch “Zambian Phone Number” / “Phone Number”.  
3. **Remember this device:** omitted (no backend support; avoid deceptive UI).  
4. **No Tailwind / Material Symbols CDN** — local CSS + SVG marks.  
5. **No remote Stitch image hotlinks.**  
6. **Pilot brand copy** “Juflona Hospital” retained on login brand panel for parity with Juflona pilot Stitch; multi-tenant branding remains a later product decision.  
7. Lifecycle screens: functional shell only (**VISUAL_BLOCKED** for Stitch MATCHED).

---

## Unavailable assets

Stitch decorative icons via Material Symbols CDN not vendored. CSS/SVG substitutes used.

---

## Tests

```bash
node --test \
  tests/activeclinic-auth-stitch-parity.test.js \
  tests/activeclinic-authentication-foundation.test.js \
  tests/activeclinic-account-lifecycle.test.js \
  tests/activeclinic-application-shell.test.js \
  tests/activeclinic-session-principal.test.js \
  tests/activeclinic-product-isolation.test.js \
  tests/blessboard-invitation-password-reset.test.js \
  tests/blessboard-user-password-reset.test.js
```

Results (latest combined runs): **pass** on S01 + foundation + lifecycle (30), shell/isolation/session (35), BlessBoard reset suites (18). No automated visual diff tooling in repo — visual score **N/A**; media comparison done via downloaded Stitch PNG references offline.

---

## Remaining gaps

- No Stitch designs for org select / activate / forgot / reset / change-password → cannot claim MATCHED.  
- Shared Error/Loading/Offline/Access Restricted not fully ported as authenticated-app chrome (auth lifecycle uses simplified state card).  
- Pixel-perfect navy spacing vs Stitch Tailwind not claimed.  
- Dashboard/shell redesign deferred to AC-V6-S02 / S03 per waves doc.

---

## Gate for next wave

**AC-V6-S02** may begin per AC-V6-11 sequence (organization/facility selection polish **or** dashboard/shell — recommend **AC-V6-S02 — Organization and Facility Selection** then **AC-V6-S03 — Dashboard and Shell**, matching waves doc).
