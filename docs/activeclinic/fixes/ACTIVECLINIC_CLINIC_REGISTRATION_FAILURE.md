# ActiveClinic — Clinic Registration Failure

**Date:** 2026-08-04  
**Branch:** `V6`  
**Live URL:** https://activeclinic.org/register-clinic  

## Exact root cause

| Item | Value |
|------|-------|
| Route | `POST /register-clinic` with `action=confirm` |
| Path | route → CSRF → `createClinicRegistrationApplication` → `INSERT INTO activeclinic.clinic_registration_applications` |
| Operation | SQL INSERT |
| Failure | PostgreSQL `42P01` — relation `activeclinic.clinic_registration_applications` does not exist |
| User symptom | HTTP 500 + `register-clinic-server-error` (“Something went wrong…”) |
| Why Hostinger logs were empty | Catch block returned the HTML error page **without structured logging** |

### Corroborating live evidence

| Probe | Result |
|-------|--------|
| `GET /register-clinic` | 200 (form only; no DB write) |
| `POST` review step | 200 review page |
| `POST` confirm | **500** server-error page |
| `GET /clinics` | **503** directory error (“could not load”) — same missing migration 019 columns (`website_published`, etc.) |
| Local insert with migrated DB | succeeds → `pending_review` |

Required migration: `db/migrations/activeclinic/019_public_website_and_booking.sql` (creates `clinic_registration_applications` and public website columns). Likely also need earlier `activeclinic` migrations `001–018` if the Hostinger testing DB never received the ActiveClinic module.

## Repair (this change set)

1. Structured success/failure logs (`activeclinic.public.clinic_application_*`) with request ID and safe DB error codes — no PII.
2. Validation aligned with SQL CHECKs (min name length 2; whitespace-only notes → NULL).
3. Success redirect includes application reference.
4. Server-error page shows request reference ID.
5. `GET /__ac/public-schema-status` (NODE_ENV≠production) reports whether the registration table exists.
6. Startup log warns when public schema is incomplete.
7. Tests covering contract, success, duplicate, CSRF, missing-table 500.

## Operator fix for live

On the **ActiveClinic Hostinger testing** database (`environment_code=testing`, profile `activeclinic-org-v6`):

```bash
# From repo root, with ActiveClinic Hostinger DATABASE_URL only:
DATABASE_URL='…activeclinic testing…' npm run db:identity:check
DATABASE_URL='…' npm run db:status
DATABASE_URL='…' npm run db:migrate
```

Then restart the ActiveClinic Node process and verify:

- `GET https://activeclinic.org/__ac/public-schema-status` → `ok: true`
- `GET https://activeclinic.org/clinics` → 200
- Controlled fictional `POST /register-clinic` confirm → 303 success + one `pending_review` row

Do **not** point migrate at BlessBoard databases (`identity_key=blessboard-platform-v5`).

## Semantics unchanged

Successful submission creates **only** a `pending_review` application. No org, product, HCO, facility, staff, or publication.
