# V8 ActiveClinic Booking POST 400 (PROMPT 33)

**Verdict:** `V8_AC_BOOKING_HOSTED_PASS`  
**Branch:** `V8` only  
**Clinic:** `ac-v8-qa-mub23a6v6a6b`  
**Host:** `activeclinic.neuniversity.org`  
**Hosted SHA at verify:** `9cb0c3f2c70c` (`moovex-platform-v8-testing`)

## Finding

Prior hosted QA reported `POST /clinics/:key/book` → **400**. Contact inquiry still passed.

## Root cause (not a booking workflow defect)

Booking is a **multi-step wizard**. Canonical happy path:

1. `GET /clinics/:key/book` → service step (`wizardAction=continue`)
2. `POST …/book/doctor` → `doctorChoice`
3. `POST …/book/slot` → `preferredStartsAt`
4. `POST …/book/patient` → name / phone / email / reason
5. `POST …/book/submit` → CSRF + `idempotencyKey`

`POST /book` **without** `wizardAction=continue` is the **legacy single-form** shortcut. It requires `patientFirstName`, `patientLastName`, `patientPhone` (and related fields). A contact-style body (`__email`, `__name`, …) fails server validation and correctly returns **400** with:

> Unable to submit booking request. Check your details and try again.

That response uses `booking/appointment-entry` (`data-ac-page-section="booking-entry"`). No `public_booking_requests` row is written.

## Hosted evidence (valid wizard)

| Step | Result |
|------|--------|
| Invalid legacy POST `/book` | **400** (expected) |
| Wizard → `/book/submit` | **200** `booking-submitted` / “Request submitted” |
| Persistence | `activeclinic.public_booking_requests` row `submitted_pending_confirmation` for org `ac-v8-qa-mub23a6v6a6b` (patient V8 Booker, preferred `2030-06-15T09:30Z`) |
| Confirmation copy | Pending clinic confirmation — **not** a confirmed appointment |

Slot UI showed `data-ac-slot-state="no_slots_published"`; preferred datetime entry still advances (clinic confirms availability later).

## Changes

| Area | Change |
|------|--------|
| QA harness | `scripts/local/v8-hosted-auth-qa-prompt29.js` walks the wizard + asserts expected legacy 400 |
| Tests | `tests/activeclinic-public-booking.test.js` — incomplete legacy POST → 400, no DB row |
| Product booking code | **Unchanged** (validation behavior correct) |

V7 / production untouched.

## Return

```
V8_AC_BOOKING_HOSTED_PASS
```
