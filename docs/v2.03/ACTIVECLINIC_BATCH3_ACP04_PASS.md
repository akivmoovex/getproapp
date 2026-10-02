# ActiveClinic V2.03 Batch 3 — AC-P04 Leaf Pass

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_BATCH3_ACP04_PASS` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Precondition** | `V2_03_BATCH3_ACP03_ACP07_PASS` (`cdcc9d4c`) |
| **Stitch project** | `3741389873539108242` |
| **Verdict** | `V2_03_BATCH3_ACP04_PASS` |

---

## Ownership (reused)

| Screen | Route | View | Service | Auth |
|--------|-------|------|---------|------|
| **AC-P04** Appointment Detail & Reschedule | `GET /clinics/:clinicKey/patient/bookings/:reference` | `patient/booking-detail.ejs` | `getPatientBooking` | Patient portal session |
| Reschedule | `POST .../reschedule` | same | `requestPatientBookingReschedule` | Patient portal + CSRF |
| Cancel | `POST .../cancel` | same | `requestPatientBookingCancellation` | Patient portal + CSRF |

**Untouched frozen staff surfaces:** Patients workspace, Appointment Detail (staff), Clinical encounter shell, Billing, Facilities, staff tokens/nav.

**Cache bump:** patient portal `ASSET_VERSION` → `v2-03-b3-acp04-01`.

---

## Stitch references

| Code | Desktop | Mobile |
|------|---------|--------|
| AC-P04 | `497d0c05f6f241f981d07b47be7c7606` | `0af4b000cec2477389a576b11b33cba0` |

---

## Intentional omissions (no schema invented)

- Live availability / slot calendar
- Fast check-in / QR / exam-room countdown
- Provider ratings / license chrome
- Wayfinding, parking maps, Get Directions deep links
- Pre-visit intake instructions
- Add to Calendar (.ics), Summary PDF, Print

Kept existing request-based reschedule (`datetime-local`) and cancellation — clinic confirms; no silent staff-slot rewrite.

---

## Tests

- `tests/activeclinic-batch3-acp04.test.js` — markers + owned detail render + reschedule POST + cross-clinic isolation
- `tests/activeclinic-batch3-acp03-acp07.test.js` — asset stamp prefix remains green

---

## Production / deploy

**Not pushed. Not deployed.**
