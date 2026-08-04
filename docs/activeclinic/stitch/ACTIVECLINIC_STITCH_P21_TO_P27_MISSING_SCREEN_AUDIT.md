# ActiveClinic Stitch — P21–P27 Missing Screen Audit

**Audited:** 2026-08-04  
**Branch:** `V6`  
**Starting SHA:** `cc34359c1e1bf1c5c1d9cb87be3ae93dc340d57b`  
**origin/V6:** `cc34359c1e1bf1c5c1d9cb87be3ae93dc340d57b` (0 ahead / 0 behind)  
**Working tree at audit start:** clean  
**Production touched:** no  

**Authoritative Stitch project:** `projects/17813606734422395399` — ActiveClinic Public Ecosystem & Booking Flow  
**Live inventory JSON:** `_p21_p27_live_inventory.json`  
**Clinical project (not used for P21–P27):** `projects/12272131183982732110`

## Environment snapshot

| Item | Value |
|------|-------|
| Repository | `/Users/akivsolomon/Documents/DocumentsAkiv/Akiv/Dev/CursorProjects/getpro` |
| Public entry | `GET /` → `activeClinicPublicRoutes` → `views/activeclinic/public/home.ejs` |
| Tenant entry | `GET /clinics/:clinicKey` |
| Patient portal entry | `GET /clinics/:clinicKey/patient/*` via `activeClinicPatientPortalRoutes` |
| Migrations | platform `001–026`; activeclinic `001–020` |
| Stitch connection | MCP `user-stitch` ready |

## Live Stitch counts vs prior docs

| Phase | Prior doc count | Live Stitch | Delta |
|------:|----------------:|------------:|------:|
| P20 foundation | 5 | 5 | 0 |
| P21 | 11 | **28** | +17 |
| P22 | 13 | **33** | +20 |
| P23 | 15 | 15 | 0 |
| P24 | 19 | 19 | 0 |
| P25 | 24 | 24 | 0 |
| P26 | 35 | 35 | 0 |
| P27 | 30 | 30 | 0 |
| **P21–P27 total** | ~147 | **184** | +37 named screens mainly in P21/P22 |

Duplicates in Stitch (treat newer ID as canonical where two Homes/Directories exist):

| Name | IDs | Canonical |
|------|-----|-----------|
| P21 Home Desktop | `22391e15…`, `f96b4855…` | `f96b485558c64fc38193c5d3231633ec` (taller) |
| P21 Home Mobile | `6dadae69…`, `2ccf3272…` | `2ccf327230b640c3b3340e5bca2bb162` |
| P21 Directory Desktop | `2c612094…`, `dac958cf…` | `dac958cf9559485aa0aac7803360cf40` |

## Pre-implementation status (evidence-based)

Prior ledger claimed COMPLETE with FUNCTIONAL_ONLY visuals. Route evidence shows **thin vertical slices**, not screen parity.

### Status legend used below

COMPLETE · VISUAL_MISMATCH · FUNCTIONAL_ONLY · PARTIAL · PLACEHOLDER · MISSING · BROKEN · DEAD_CONTROL · BACKEND_BLOCKED · PRODUCT_DECISION · DUPLICATE · SUPERSEDED

### P21 (28 live)

| Stitch name | ID | Pre status | Route / view | Notes |
|-------------|-----|------------|--------------|-------|
| Home Desktop (canonical) | `f96b4855…` | PARTIAL | `/` home.ejs | Minimal hero only |
| Home Desktop (older) | `22391e15…` | DUPLICATE | — | Superseded by canonical |
| Home Mobile (canonical) | `2ccf3272…` | PARTIAL | same responsive | |
| Home Mobile (older) | `6dadae69…` | DUPLICATE | — | |
| About D/M | `4443fa4c…` / `24474298…` | PARTIAL | `/about` | Thin copy |
| Solutions D/M | `ac6b69a1…` / `990884d1…` | PARTIAL | `/solutions` | Thin list |
| Directory D/M | `dac958cf…` / `85f99ea3…` | PARTIAL | `/clinics` | Populated works; empty thin |
| Directory Empty D/M | `2c495fc4…` / `08791796…` | MISSING | — | Plain empty `<p>` only |
| Directory Loading D/M | `3cf8b9cb…` / `4889fc17…` | MISSING | — | No loading UI |
| Directory Error D/M | `cdc46325…` / `82299e09…` | MISSING | — | `next(err)` stack risk |
| Search States Mobile | `50d278a0…` | PARTIAL | `/clinics/search` | Minimal |
| Onboarding Desktop | `a45f68ec…` | PARTIAL | `/register-clinic` | Form only |
| Onboarding Mobile | `18f6b1a3…` | PARTIAL | same | |
| Onboarding Review D/M | `fa556d16…` / `254bcedf…` | MISSING | — | No review step |
| Onboarding Success D/M | `f9f88532…` / `7f422dcc…` | FUNCTIONAL_ONLY | `/register-clinic/success` | |
| Onboarding Validation Error D/M | `341517f5…` / `9a4d8a72…` | PARTIAL | inline alert | |
| Onboarding Server Error D/M | `3410067a…` / `8c33ca1f…` | MISSING | — | |

### P22 (33 live) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| Juflona Public Home/About/Contact/Patient Info/Privacy/Terms | FUNCTIONAL_ONLY | Content thin vs Stitch |
| Contact Success | **BROKEN** | `contact-success.ejs` unused; `?submitted=1` ignored |
| Pricing D/M | MISSING | No route |
| Location D/M | MISSING | No route |
| Closed/Unavailable D/M | MISSING | Bare HTML string |
| Not Found D/M | MISSING | Bare HTML string |
| Booking Entry D/M | PARTIAL | Redirects into P24 stub |
| Demo Clinic * | PRODUCT_DECISION | Same templates + demo data; no separate code path required |

### P23 (15) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| Services / Doctors directories | FUNCTIONAL_ONLY | Empty states thin |
| Service detail variants (consult/info/procedure) | PARTIAL | One generic detail |
| Price Patterns | MISSING | |
| Doctors/Service States | PARTIAL | |
| Book handoff `?service=` | **BROKEN** | Prefill not read |

### P24 (19) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| Appointment Entry | PARTIAL | Collapsed single form |
| Type / Doctor / Slot / Patient / Review / Progress | MISSING | Explicit stub in routes |
| Availability / Form / SMS States | MISSING / PRODUCT_DECISION | SMS honesty only |

### P25 (24) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| Procedure entry | PARTIAL | Single form |
| Referral / Upload / Prep / Resource states | PARTIAL / BACKEND_BLOCKED | Upload → clinic_follow_up honesty |
| Wizard steps | MISSING | |

### P26 (35) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| My Booking lookup/detail | PARTIAL | |
| Status-specific details | PARTIAL | One detail view |
| Cancel/Reschedule Request→Review→Submitted | MISSING | Immediate POST |
| Lookup error/progress states | PARTIAL | |
| Action gating by status | **BROKEN** UX | Always shows cancel/reschedule |

### P27 (30) — summary

| Family | Pre status | Gap |
|--------|------------|-----|
| Login/Register/Forgot/Reset/Dashboard/Profile/Security | FUNCTIONAL_ONLY | Inline HTML renderer, no EJS |
| Verify Phone / Verification Success / Recovery Verification | MISSING / PRODUCT_DECISION | No OTP delivery |
| Link Guest Booking screen | PARTIAL | Field on register only |
| Booking Filters / Offline / Notifications | PARTIAL / PRODUCT_DECISION | Honesty empty |
| Patterns / Data Boundaries | PRODUCT_DECISION | Document, don’t invent EMR |

## Newly discovered vs initial P21 checklist

Screens in live Stitch beyond the mission’s numbered P21 list of 25:

1. Duplicate Home Desktop/Mobile (superseded variants)  
2. Duplicate Directory Desktop  
3. Demo Clinic family under P22 (data-driven, not separate apps)  
4. Full P22–P27 expansions already inventoried in live project (Pricing, Location, Closed, Not Found, wizard states, portal auth states)

## Implementation order for this run

1. Shared tokens + clinic respond helpers + nav contracts  
2. Broken fixes (contact success, book prefill, CSRF HTML, cancel gating)  
3. P21 states + onboarding review + content depth  
4. P22 pricing/location/closed/not-found  
5. P23 states + price patterns + procedure detail  
6. P24/P25 multi-step drafts  
7. P26 cancel/reschedule flows  
8. P27 EJS + honesty verify/link screens  
9. Tests + docs + local commits  

## Honest constraints carried forward

- Do not invent clinic/patient counts, SMS delivery, real-time slots, or medical records access.  
- Secure upload remains BACKEND_BLOCKED → clinic follow-up.  
- Phone OTP remains PRODUCT_DECISION / honesty.  
- Visual MATCHED requires rendered comparison; start as CLOSE / FUNCTIONAL_ONLY until compared.
