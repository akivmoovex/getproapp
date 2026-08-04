# ActiveClinic Stitch — P20–P27 Route Matrix

**Audited:** 2026-08-04
**Stitch design project (website/booking):** `projects/17813606734422395399` — ActiveClinic Public Ecosystem & Booking Flow  
**Clinical app project (P01–P07/P13):** `projects/12272131183982732110` — ActiveClinic – Juflona Pilot  
**Note:** P20–P27 screens live in the Public Ecosystem project. The Juflona Pilot project contains **zero** P20–P27 screens (verified 2026-08-04).

## Canonical platform public routes

| Method | Path | Phase | Screen(s) | Auth | Notes |
|--------|------|------:|-----------|------|-------|
| GET | `/` | P21 | Home Desktop/Mobile | Public | Replaces foundation stub for unauthenticated visitors |
| GET | `/about` | P21 | About | Public | |
| GET | `/solutions` | P21 | Solutions | Public | |
| GET | `/clinics` | P21 | Clinic Directory | Public | Publishable clinics only |
| GET | `/clinics/search` | P21 | Search States | Public | Query-string filters |
| GET | `/register-clinic` | P21 | Clinic Onboarding | Public | Application, not auto-approve |
| POST | `/register-clinic` | P21 | Clinic Onboarding | Public | CSRF + rate limit |
| GET | `/register-clinic/success` | P21 | Onboarding Success | Public | Honest messaging |

## Canonical tenant public routes

| Method | Path | Phase | Screen(s) | Auth | Notes |
|--------|------|------:|-----------|------|-------|
| GET | `/clinics/:clinicKey` | P22 | Juflona Home | Public | Server-resolved org |
| GET | `/clinics/:clinicKey/about` | P22 | About | Public | |
| GET | `/clinics/:clinicKey/contact` | P22 | Contact | Public | |
| POST | `/clinics/:clinicKey/contact` | P22 | Contact / Success | Public | Store inquiry; no fake delivery claim |
| GET | `/clinics/:clinicKey/patient-information` | P22 | Patient Information | Public | |
| GET | `/clinics/:clinicKey/privacy` | P22 | Privacy | Public | |
| GET | `/clinics/:clinicKey/terms` | P22 | Terms | Public | |
| GET | `/clinics/:clinicKey/services` | P23 | Services | Public | |
| GET | `/clinics/:clinicKey/services/:serviceKey` | P23 | Service detail variants | Public | |
| GET | `/clinics/:clinicKey/doctors` | P23 | Doctors | Public | Only public-safe staff profiles |
| GET | `/clinics/:clinicKey/doctors/:staffKey` | P23 | Doctor Profile | Public | |
| GET | `/clinics/:clinicKey/book` | P24 | Appointment Entry | Public | Tenant+facility locked |
| … | booking wizard steps | P24 | … | Public | Session-scoped booking draft |
| GET | `/clinics/:clinicKey/book/procedures` | P25 | Choose Procedure | Public | |
| … | procedure wizard | P25 | … | Public | Pending confirmation honesty |
| GET | `/clinics/:clinicKey/my-booking` | P26 | My Booking / Lookup | Token/public | Privacy-safe lookup |
| … | cancel/reschedule | P26 | … | Token | |

## Boundaries

| Surface | Route family | Session |
|---------|--------------|---------|
| Platform public | `/`, `/about`, `/solutions`, `/clinics`, `/register-clinic` | Optional CSRF |
| Tenant public | `/clinics/:clinicKey/*` | Tenant resolved server-side |
| Booking | `/clinics/:clinicKey/book*`, `/my-booking*` | Draft cookie + CSRF |
| Staff app | `/login`, `/app/*` | Staff session — unchanged |

## Redirects / legacy

| From | To | Reason |
|------|-----|--------|
| Competing `/clinic/:key`, `/c/:key`, `/tenant/:key` | **Not created** | Single canonical `/clinics/:clinicKey` |
| Authenticated GET `/` | `/app` | Preserve staff landing (P01) |

## Unresolved

| Item | Status |
|------|--------|
| Custom domain per clinic | Documented readiness only — host mapping not shipped |
| P27 routes | **Not reserved** until Stitch stable |
