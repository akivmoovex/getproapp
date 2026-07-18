# Batch 07B — Registration Submitted (presentation)

**Date:** 2026-07-18  
**Scope:** Presentation only for tenant `/register/submitted`. **Login transfer not started.**  
**References:** [`STITCH_SCREEN_MAP.md`](./STITCH_SCREEN_MAP.md) (order 23), [`VISUAL_SYSTEM.md`](./VISUAL_SYSTEM.md), [`BATCH_07A_REGISTRATION.md`](./BATCH_07A_REGISTRATION.md)

## 1. Canonical Stitch screen IDs

| Role | Exact title | ID |
|------|-------------|-----|
| Desktop Submitted | `11-auth-registration-submitted-desktop` | `1d37704351d6425ca872f8803322175c` |
| Mobile Submitted | `11-auth-registration-submitted-mobile` | `f222e55152c349cc880548037aa7d540` |

## 2. Files changed

| Path | Change |
|------|--------|
| `views/blessboard/v5/public/register-submitted.ejs` | Success layout, honest next-step copy, CTAs |
| `public/blessboard/v5/tenant-auth.css` | Submitted card, XL success icon, callout, badges (`?v=8`) |
| `views/blessboard/v5/public/register.ejs` | CSS cache bump to `?v=8` only |
| `tests/blessboard-member-registration.test.js` | Submitted render + wording assertions |
| `tests/blessboard-v5-a11y-structure.test.js` | Submitted a11y + omitted Stitch fabrications |
| `docs/gui/BATCH_07B_REGISTRATION_SUBMITTED.md` | This document |

**Unchanged:** `GET /register/submitted` route, redirect after successful `POST /register`, registration services/DB, hostname scope, apex login / transfer.

## 3. Final wording (actual V5 next step)

| Surface | Copy |
|---------|------|
| Title | Registration Submitted |
| Lead | Thank you… registration received and **pending administrator review**. An account is **not** created automatically. |
| Callout | A branch administrator must review your details before member access is granted. This page does **not** send email or SMS updates. |
| Next steps | (1) Leadership reviews when ready (2) Continue browsing the public site (3) Sign-in only after approval |
| CTAs | Return Home → `/` · Contact Office → `/contact` |

## 4. Intentional deviations from Stitch

1. **No Submission ID** (not exposed by V5).  
2. **No Submitted On / Est. Processing Time** (no SLA).  
3. **No email confirmation / email notification** promises.  
4. **No automatic access** claim.  
5. Mobile “Success” badge kept; pending-review status remains authoritative.  
6. Sacred Modernity violet + Hanken; tenant-auth shell reused.

## 5. Tests and results

| Command | Result |
|---------|--------|
| `npm run test:blessboard:member-registration` | **13/13 pass** |
| `npm run test:blessboard:a11y-structure` | **31/31 pass** |
| `npx stylelint public/blessboard/v5/tenant-auth.css` | **0 errors** (hex warnings only) |
| `git diff --check` | **clean** |

## 6. Remaining gaps / next

1. Apex / tenant login transfer presentation is **next** when requested.  
2. Waiting-verification / forgot-password remain product-blocked.

## 7. Suggested commit message

```
Polish registration submitted success screen to canonical Stitch presentation.
```
