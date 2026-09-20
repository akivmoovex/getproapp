# V8 ActiveClinic Booking and Inquiry Fix (PROMPT 03)

**Verdict:** `V8_AC_BOOKING_CODE_PASS`  
**Branch:** `V8` only  
**Recorded:** 2026-09-21  
**Prior fix ancestry:** `0c873840` (idempotent booking retry + inquiry duplicate window) · BUG-001 rate-limit fix  
**Production / V7 branch:** untouched  
**Hosted deploy:** not performed (overnight rule 10)

---

## Trace (public form → staff review)

| Stage | Booking (consultation) | Clinic inquiry |
|-------|------------------------|----------------|
| Public form | `/clinics/:key/book` … `/book/submit` | `/clinics/:key/contact` |
| Validation | CSRF + draft fields + phone/email + facility ownership | Shared UUID/text validators + AC email/phone normalizers + CSRF |
| API / service | `createConsultationBookingRequest` | `createPublicContactInquiry` |
| Database | `activeclinic.public_booking_requests` (`submitted_pending_confirmation`) | `activeclinic.public_contact_inquiries` (`received`) |
| Confirmation | `booking/request-submitted` — **not** a confirmed appointment | `tenant/contact-success` — message receipt only |
| Staff review | Existing booking / clinic ops queues (unchanged) | Persisted inquiry rows scoped to org/HCO/facility |

Guest submission is the public path (no login required). Authenticated browsing does not change ownership rules; portal account creation remains an optional post-submit CTA.

---

## Changes in this prompt

| Area | Change |
|------|--------|
| Inquiry ownership | Clinic contact POST now stores `facilityId: clinic.primaryFacilityId` when present |
| Facility gate | Inquiry service verifies facility is active and owned by the same org + HCO |
| Shared validation | `validateUuid` / `validateText` from `src/platform/validation` for clinic + apex contact inputs |
| Confirmation copy | Explicit “not a booking or appointment confirmation” on tenant + apex contact success |
| Tests | Persist facility_id + tenant isolation; booking submit asserts facility/org ownership |

**Preserved:** V7 booking wizard behavior, idempotent submit after draft clear, inquiry 30-minute duplicate suppression, booking confirmation language (“not a confirmed appointment”).

---

## Requirements checklist

| Requirement | Status |
|-------------|--------|
| Correct clinic/facility ownership | **PASS** |
| Guest (and session-optional) submission | **PASS** |
| Server-side validation | **PASS** |
| Persistent inquiry / booking records | **PASS** |
| Duplicate-submit protection | **PASS** |
| Clear confirmation + recoverable errors | **PASS** |
| Inquiry receipt ≠ confirmed appointment | **PASS** |
| Preserve V7 booking behavior | **PASS** |
| Reuse shared validation | **PASS** (contact path) |

---

## Automated results

| Gate | Result |
|------|--------|
| `tests/activeclinic-public-booking.test.js` + `tests/activeclinic-public-website.test.js` | **18/18 PASS** |
| ActiveClinic V8 suite (`node scripts/v8/run-suite.js activeclinic`) | **105/105 PASS** |

Evidence: `/tmp/v8-book-p03/`.

---

## Final result

| Field | Value |
|-------|-------|
| Verdict | **`V8_AC_BOOKING_CODE_PASS`** |
| Blockers | None |
