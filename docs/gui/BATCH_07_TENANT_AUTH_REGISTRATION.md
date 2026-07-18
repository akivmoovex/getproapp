# Batch 07 — Tenant auth registration and login transfer presentation

**Date:** 2026-07-18  
**Scope:** Presentation only for `/register`, `/register/submitted`, apex `/login`, and auth-error / transfer failure chrome  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_06_CONTACT_GIVING.md`](./BATCH_06_CONTACT_GIVING.md), [`STITCH_IMPLEMENTATION_BACKLOG.md`](./STITCH_IMPLEMENTATION_BACKLOG.md) Batch 7

## 1. Canonical Stitch screen IDs

| Screen | Desktop | Mobile | Exact titles |
|--------|---------|--------|--------------|
| Member registration | `c360aef636d341a8ad3eb47c4c2e5c21` | `7d77190575b54d1b8277726570aec1c4` | `10-auth-member-registration-*` |
| Registration submitted | `1d37704351d6425ca872f8803322175c` | `f222e55152c349cc880548037aa7d540` | `11-auth-registration-submitted-*` |
| Login (apex transfer) | `9b264ef3081f4b5aab493d9b9710b00b` | `68a84bcc8dff4f4ca5836216c22a2e6a` | `09-auth-member-login-*` |
| Auth error | — | — | `STITCH_MISSING` — shares login chrome |

**Deferred (MISSING — not implemented):** waiting-verification (`239beae5…` / `8e6e504f…`), forgot-password (`61a6861b…` / `f4bb9457…`).

## 2. Files changed (presentation only)

| Area | Path |
|------|------|
| Registration | `views/blessboard/v5/public/register.ejs` |
| Submitted | `views/blessboard/v5/public/register-submitted.ejs` |
| Apex login | `views/blessboard/v5/apex/login.ejs` |
| Auth error | `views/blessboard/v5/apex/auth-error.ejs` |
| CSS | `public/blessboard/v5/tenant-auth.css` (`?v=5`), `apex-auth.css` (`?v=4`) |
| Tests | `tests/blessboard-member-registration.test.js`, `blessboard-apex-auth-gui.test.js`, `blessboard-v5-a11y-structure.test.js` |
| Doc | `docs/gui/BATCH_07_TENANT_AUTH_REGISTRATION.md` |
| Screen map notes | `docs/gui/STITCH_SCREEN_MAP.md` |

**Unchanged (intentional):** auth services, session cookies, CSRF issuance/validation, transfer token create/consume, hostname binding, redirects, rate limits, registration field validation, POST targets, field names.

## 3. Data / form fields preserved

| Surface | Fields / behavior |
|---------|-------------------|
| Registration POST | `first_name`, `last_name`, `preferred_name`, `email`, `phone`, CSRF (`csrfField`) → `POST /register` |
| Required/optional | First + last required; preferred optional; email **or** phone required (server rule) |
| Privacy | Static notice only (`data-bb-auth-privacy`) — **no** consent checkbox POST field (unsupported) |
| Submitted | Confirmation chrome only; no submission ID, no SLA timing |
| Apex login | `email`, `password`, `_csrf`; form posts to current URL (preserves `?tr=` in browser) |
| Transfer display | Authoritative `transferHostname` only — never raw `tr` token |

## 4. Form / transfer behavior (unchanged)

1. Tenant `/login` still redirects to apex transfer (no tenant password form).  
2. Apex login never embeds transfer tokens in HTML.  
3. Auth-error messages remain classified expired / consumed / unauthorized / throttled / generic.  
4. No open-redirect UI: no `next` / `return_to` / `redirect` inputs.  
5. No forgot-password, social login, or waiting-verification routes.

## 5. Security notes

- CSRF retained on registration and login POSTs.  
- `referrer: no-referrer` on login and auth-error.  
- Error copy stays user-safe (no internal reasons, tokens, or stack details).  
- Registration still rejects church/branch ID fields from the client.  
- Submitted page does not promise email, SMS, or approval timing.

## 6. Intentional deviations from Stitch

1. Single-page registration (not multi-step wizard).  
2. No gender, age group, address, ministry interests, emergency contact, or password fields (not in V5 schema/service).  
3. No privacy-policy checkbox that would invent validation.  
4. No “Forgot password?” or “Register as Member” on apex login.  
5. No fabricated submission ID or 24–48 hour processing estimate.  
6. Apex dual-pane login instead of tenant-centered Stitch password card (product: transfer auth).  
7. Sacred Modernity violet + Hanken.

## 7. Responsive status

| Width | Notes |
|-------|-------|
| 375px | Single-column auth main; register hero stacks |
| 768px | Field rows still 1-col until 900px |
| 1440px | Split panel + 2-col name/contact rows |
| 320px | Auth overflow guards; reduced card radius |

## 8. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **13/13 pass** |
| `npm run test:blessboard:apex-auth-gui` | **4/4 pass** |
| `npm run test:blessboard:tenant-auth` | **13/13 pass** |
| `npm run test:blessboard:authorization` | **16/16 pass** |
| `npm run test:blessboard:a11y-structure` | **21/21 pass** |
| `npx stylelint public/blessboard/v5/tenant-auth.css public/blessboard/v5/apex-auth.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 9. Stop condition

Visual work did **not** require authentication or transfer-logic modifications. Routes and services untouched.

## 10. Next recommendation

**Batch 8 — Member portal** (shell + dashboard/profile first). Do not start until requested. Continue deferring waiting-verification and forgot-password until product decisions exist.

## 11. Suggested commit message

```
Polish tenant registration and apex transfer login chrome to Stitch auth pairs.
```
