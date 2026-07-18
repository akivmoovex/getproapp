# Batch 07C — Tenant auth transfer presentation

**Date:** 2026-07-18  
**Scope:** Presentation only for tenant login entry (apex transfer target), transfer callback status chrome, transfer failure states, and safe authentication error states. **Member portal not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (orders 10–11), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`docs/database/ARCHITECTURE.md`](../database/ARCHITECTURE.md) (tenant-host login transfer), [`BATCH_07B_REGISTRATION_SUBMITTED.md`](./BATCH_07B_REGISTRATION_SUBMITTED.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Login | `09-auth-member-login-desktop` | `9b264ef3081f4b5aab493d9b9710b00b` |
| Mobile Login | `09-auth-member-login-mobile` | `68a84bcc8dff4f4ca5836216c22a2e6a` |
| Auth error / transfer failure | — | `STITCH_MISSING` (reuses apex dual-pane auth chrome) |

**Not implemented (product-blocked):** waiting-verification, forgot-password, social login.

## 2. States implemented

| State | Surface | Notes |
|-------|---------|-------|
| Tenant login entry | Apex `GET /login?tr=…` after tenant `/login` redirect | No tenant password form; apex dual-pane “Member Access” |
| Transfer callback status | Hostname status banner on apex login | Shows authoritative `transferHostname` only |
| Transfer failure | `renderAuthErrorPage` / `auth-error.ejs` | expired · consumed · unauthorized · throttled · generic |
| Safe auth error on form | Login inline `role="alert"` | credentials · throttled · expired · generic |

## 3. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/apex/login.ejs` | Transfer status chrome, centered intro, CSS bumps |
| `views/blessboard/v5/apex/auth-error.ejs` | Failure card, badges, safe hints, CSS bumps |
| `src/blessboard/http/renderTenantLandingPage.js` | Transfer subtitle copy only (“Welcome back to your church family”) |
| `public/blessboard/v5/tenant-auth.css` | Transfer status, error card, login intro (`?v=9`) |
| `public/blessboard/v5/apex-auth.css` | Login/error motion + reduced-motion (`?v=5`) |
| `views/blessboard/v5/public/register.ejs` | CSS cache bump to `?v=9` |
| `views/blessboard/v5/public/register-submitted.ejs` | CSS cache bump to `?v=9` |
| `views/blessboard/v5/partials/apex-shell-start.ejs` | `apex-auth.css?v=5` |
| `tests/blessboard-apex-auth-gui.test.js` | Transfer + error presentation assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Login/error a11y + omitted Stitch fabrications |
| `docs/gui/BATCH_07C_TENANT_AUTH_TRANSFER.md` | This document |

**Unchanged (intentional):** sessions, CSRF issuance/validation, transfer token create/consume/expiry, hostname binding, redirects, rate limits, `/auth/callback` redeem logic, field names (`email`, `password`, `_csrf`), POST targets.

## 4. Intentional deviations from Stitch

1. **Apex dual-pane** instead of tenant-centered password card (product: passwords only on apex).  
2. **No “Forgot password?”** (no V5 route).  
3. **No “Register as Member”** on apex login (registration stays on tenant `/register`).  
4. **Email only** (not Stitch “Email or Phone Number”).  
5. **Tenant `/login` remains redirect-only** — never invent a tenant password UI.  
6. Transfer status shows **hostname**, never raw `tr` / redeem `code`.  
7. Auth-error is **STITCH_MISSING** — safe generic wording only.

## 5. Security confirmation

- No changes to session cookies, CSRF, transfer tokens, expiry, hostname binding, or redirects.  
- Transfer tokens are never embedded in HTML (`transferToken` ignored by template).  
- Form posts to the current URL so the browser preserves `?tr=` without putting the token in markup.  
- `referrer: no-referrer` retained on login and auth-error.  
- No open-redirect fields (`next` / `return_to` / `redirect`).  
- No forgot-password, social login, or waiting-verification UI.  
- Error copy stays user-safe (no tokens, stack traces, or internal reason codes).

## 6. Stop condition

Visual work did **not** require authentication-logic changes. No design requirement needed sessions/CSRF/transfer protocol changes.

## 7. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:tenant-auth` | **13/13 pass** (includes CSRF transfer coverage) |
| `npm run test:platform:sessions` | **3/3 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:apex-auth-gui` | **4/4 pass** |
| `npm run test:blessboard:a11y-structure` | **32/32 pass** |
| `npx stylelint public/blessboard/v5/tenant-auth.css public/blessboard/v5/apex-auth.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 8. Remaining gaps / next

1. Member portal (Batch 8+) — **do not start until requested**.  
2. Waiting-verification / forgot-password remain product-blocked.  
3. Dedicated Stitch auth-error screens remain `STITCH_MISSING`.

## 9. Suggested commit message

```
Polish apex transfer login and auth-error chrome without changing auth logic.
```
