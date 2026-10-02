# V2.01 ActiveClinic Booking Readiness QA

**Task:** `V2_01_AC_BOOKING_READINESS_QA`  
**Date:** 2026-09-26  
**Product:** ActiveClinic only  
**Mode:** Production end-to-end probes on disposable QA clinic — synthetic guest data only  
**Release candidate:** `gitSha=03a89106e2fe` · `moovex-platform-production` · `environment=production`  
**Clinic:** `activeclinic-disposable-qa-bd9d83`  
**Personas / vault:** `docs/qa/V2_01_PROD_QA_ACCOUNTS.md` (staff verify only)  
**Evidence:** `/tmp/v2_01_ac_booking_readiness_qa.json` (local ops artifact; not committed)  
**Production code changes:** **None**

---

## Verdict

| Metric | Count |
| --- | ---: |
| **PASS** | **26** |
| **FAIL** | **0** |
| **BLOCKED** | **0** |

**Overall: FIXED_PASS**

Happy-path booking + inquiry work end-to-end on current production RC. Historical incomplete `POST /book` → **400** behavior (PROMPT33 / BUG-001) **cannot be reproduced as a defect** — it remains the designed validation response (`FIXED_VERIFIED`). No product fix applied.

---

## Environment

| Surface | Result |
| --- | --- |
| `https://activeclinic.org/healthz` | `03a89106e2fe` · production · ok |
| Public clinic | `https://activeclinic.org/clinics/activeclinic-disposable-qa-bd9d83` |
| Staff verifier | disposable AC admin → `/app` → `/app/booking-requests` |
| Guest data | `@example.invalid` emails · synthetic ZM phone · preferred slot `2030-06-20T09:30` |
| Customer data | **Not used / not altered** |

---

## Flow coverage

### 1–6. Public clinic → booking wizard → success

| Step | Result | Detail |
| --- | --- | --- |
| Open public clinic | **PASS** | `tenant-home` · Book CTAs to `/clinics/…/book` |
| Booking entry | **PASS** | `GET /book` → `booking-consultation-type` |
| Service continue | **PASS** | `wizardAction=continue` → `/book/doctor` |
| Provider select | **PASS** | `doctorChoice=any` → `/book/slot` |
| Slot + patient | **PASS** | preferred datetime + guest name/phone/email → review + `idempotencyKey` |
| Submit | **PASS** | `POST /book/submit` → **200** `booking-request-submitted` / `booking-submitted` · pending clinic confirmation (not a confirmed appointment) |
| Idempotent resubmit | **PASS** | same key · no failure / no second-create path observed |

### 7. Created record verified

| Check | Result | Detail |
| --- | --- | --- |
| Staff login | **PASS** | → `/app` |
| Booking list | **PASS** | `/app/booking-requests` shows guest **V201 BookReadiness** |
| Booking detail | **PASS** | `/app/booking-requests/98f09182-7c09-4bee-a94a-8b11f1ecea2d` · reference **BK-MUI7I7YH-032D0932** |

### Inquiry (clinic contact)

| Check | Result | Detail |
| --- | --- | --- |
| Valid inquiry submit | **PASS** | → `/contact/success` (message receipt; not a booking) |
| Duplicate window (same email+message &lt;30m) | **PASS** | still → success (reuse receipt; by design) |
| Invalid inquiry | **PASS** | **400** |

### 8. Invalid / unauthorized

| Check | Result | Detail |
| --- | --- | --- |
| Incomplete legacy `POST /book` (contact-style body, no `wizardAction`) | **PASS** / **FIXED_VERIFIED** | **400** · no booking created (PROMPT33) |
| Submit with forged CSRF (draft present) | **PASS** | **403** · session expired · not submitted |
| Submit with missing CSRF (draft present) | **PASS** | **403** · not submitted |
| Submit without session/draft | **PASS** | **303** → `/book` restart · **not** submitted (fail-closed) |
| Foreign / closed clinic book entry | **PASS** | foreign QA clinic closed or non-bookable (no cross-tenant create) |

### 9. Mobile 390px

| Surface | Result | Detail |
| --- | --- | --- |
| Clinic home | **PASS** | width 390 · Book link · no horizontal overflow |
| Booking entry | **PASS** | form present · booking page · no overflow |
| Contact | **PASS** | form present · no overflow |

### Direct `/book` (apex)

| Check | Result | Detail |
| --- | --- | --- |
| `GET https://activeclinic.org/book` | **PASS** | **302** → `/clinics` (design: pick a clinic first; wizard remains `/clinics/:key/book*`) |

---

## Historical bug status

| Item | Status |
| --- | --- |
| Hosted `POST /book` → 400 mistaken for booking failure (PROMPT33 / BUG-001) | **FIXED_VERIFIED** — expected validation for incomplete legacy body; canonical path is wizard → `/book/submit` |
| Inquiry duplicate 30-minute window | **FIXED_VERIFIED** — success reuse, not double-write failure |
| Product booking/inquiry code on this task | **Unchanged** |

---

## Explicit non-actions

| Action | Status |
| --- | --- |
| Production product / auth / schema changes | Not performed (no reproducible defect requiring fix) |
| Customer clinic writes | Not performed |
| Password / secret logging | Not performed |

---

## Return token

```
V2_01_AC_BOOKING_READINESS_QA = FIXED_PASS
PASS=26 FAIL=0 BLOCKED=0
historical_bug=FIXED_VERIFIED
code_changed=false
booking_ref=BK-MUI7I7YH-032D0932
```
