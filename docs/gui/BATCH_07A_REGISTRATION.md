# Batch 07A — Tenant member registration form (presentation)

**Date:** 2026-07-18  
**Scope:** Presentation only for tenant `/register`. **Registration Submitted and login transfer not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 22), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_06B_GIVING.md`](./BATCH_06B_GIVING.md), [`BATCH_07_TENANT_AUTH_REGISTRATION.md`](./BATCH_07_TENANT_AUTH_REGISTRATION.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Registration | `10-auth-member-registration-desktop` | `c360aef636d341a8ad3eb47c4c2e5c21` |
| Mobile Registration | `10-auth-member-registration-mobile` | `7d77190575b54d1b8277726570aec1c4` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/register.ejs` | Stitch hero/grouping/labels/helpers/errors chrome; fields unchanged |
| `public/blessboard/v5/tenant-auth.css` | Register fieldsets, mobile eyebrow, responsive legend labels (`?v=7`) |
| `tests/blessboard-member-registration.test.js` | Form presentation + preserved field/CSRF assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Registration grouping + omitted wizard fields |
| `docs/gui/BATCH_07A_REGISTRATION.md` | This document |

**Unchanged:** `POST /register` route, CSRF issuance/validation, field names, validation rules, DB writes, rate limits, hostname binding, `register-submitted.ejs`, apex login / transfer.

## 3. Preserved fields and semantics

| Field | Name | Required | Notes |
|-------|------|----------|-------|
| CSRF | `csrfField` (typically `_csrf`) | yes | Hidden input |
| First name | `first_name` | yes | `aria-required`, visible `*` |
| Last name | `last_name` | yes | `aria-required`, visible `*` |
| Preferred name | `preferred_name` | optional | Helper text only |
| Email | `email` | email **or** phone | Label: Email Address |
| Phone | `phone` | email **or** phone | Label: Phone Number |

Form: `method="post"` `action="/register"` `novalidate`. Privacy notice remains static (`data-bb-auth-privacy`) — **no** consent checkbox POST field.

## 4. Presentation updates

1. Mobile hero eyebrow: “Join Our Community”; single `h1`: Member Registration.  
2. Fieldsets: Personal Info / Personal Information + Contact with bordered grouping.  
3. Labels aligned to Stitch where mapped (Email Address, Phone Number, Submit Registration).  
4. Error summary (`role="alert"`) and field-level errors preserved.  
5. Contact helper: “Provide at least an email or a phone number.”

## 5. Intentional deviations from Stitch

1. **First + last name** instead of Stitch single “Full Name” (V5 schema).  
2. **No gender, address, ministry interests, emergency contact, password / confirm password.**  
3. **No multi-step wizard / Continue** — single submit page.  
4. **No privacy-policy checkbox** that would invent validation.  
5. **No email/SMS verification or password-reset** chrome.  
6. Sacred Modernity violet + Hanken (not Stitch Inter / underline inputs).

## 6. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **13/13 pass** (form, CSRF, validation, workflow) |
| `npm run test:blessboard:a11y-structure` | **30/30 pass** |
| `npx stylelint public/blessboard/v5/tenant-auth.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 7. Remaining gaps / next

1. Registration Submitted confirmation chrome is **Batch 07B** — not this batch.  
2. Apex login transfer remains deferred until requested.  
3. Waiting-verification / forgot-password remain product-blocked.

## 8. Suggested commit message

```
Polish tenant member registration form to canonical Stitch presentation.
```
