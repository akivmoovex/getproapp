# ActiveClinic P27 — Route Matrix

**Canonical family:** `/clinics/:clinicKey/patient/*` (tenant-scoped; aligns with P20–P26).

Competing apex `/patient/*` without clinic key is **not** created.

| Method | Path | Screens | Auth |
|--------|------|---------|------|
| GET/POST | `/clinics/:clinicKey/patient/login` | Login Desktop/Mobile + states | Public |
| POST | `/clinics/:clinicKey/patient/logout` | — | Patient session |
| GET/POST | `/clinics/:clinicKey/patient/register` | Register + Registration States | Public |
| GET/POST | `/clinics/:clinicKey/patient/verify-phone` | Verify Phone + Verification Success | Pending identity |
| GET/POST | `/clinics/:clinicKey/patient/set-password` | Set New Password | Token / pending |
| GET/POST | `/clinics/:clinicKey/patient/forgot-password` | Forgot Password | Public |
| GET/POST | `/clinics/:clinicKey/patient/reset-password` | Recovery Verification / Set password | Token |
| GET | `/clinics/:clinicKey/patient` | Dashboard (+ empty/multiple) | Patient |
| GET | `/clinics/:clinicKey/patient/bookings` | My Bookings + Filters | Patient |
| GET | `/clinics/:clinicKey/patient/bookings/:reference` | Booking Detail | Patient |
| POST | `/clinics/:clinicKey/patient/bookings/:reference/cancel` | — (reuse P26 semantics) | Patient |
| POST | `/clinics/:clinicKey/patient/bookings/:reference/reschedule` | — | Patient |
| GET/POST | `/clinics/:clinicKey/patient/link-booking` | Link Guest Booking | Patient |
| GET/POST | `/clinics/:clinicKey/patient/profile` | Profile | Patient |
| GET/POST | `/clinics/:clinicKey/patient/security` | Account Security | Patient |
| GET | `/clinics/:clinicKey/patient/notifications` | Notifications (honesty) | Patient |

Staff `/login` and `/app/*` unchanged.
