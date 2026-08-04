# ActiveClinic — Clinic Registration Repair Deployment

**Date:** 2026-08-04  
**Target:** `activeclinic.org` only (`PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6`)  
**Do not deploy to BlessBoard hosts.**

## Gates before migrate

1. Confirm Hostinger env:
   - `PLATFORM_DEPLOYMENT_CODE=activeclinic-org-v6`
   - `NODE_ENV=testing` / `DEPLOYMENT_ENV=testing`
   - `DATABASE_URL` = ActiveClinic testing DB (not BlessBoard)
2. `DATABASE_URL=… npm run db:identity:check` → `environment_code=testing`
3. `DATABASE_URL=… npm run db:status` → list pending `activeclinic` versions (expect `019` and possibly earlier if module never applied)

## Apply migrations

```bash
cd /path/to/getpro
git checkout V6
git pull origin V6
DATABASE_URL='<ActiveClinic Hostinger testing DATABASE_URL>' npm run db:migrate
DATABASE_URL='…' npm run db:status
```

Confirm ledger includes `activeclinic` / `019_public_website_and_booking.sql` (and `020` if pending).

## Deploy application code

1. Push `V6` (no force).
2. Redeploy / restart **only** the ActiveClinic Hostinger Node app.
3. Confirm startup log contains `activeclinic.public.schema_status` with `"ok":true`.
4. Confirm `GET /__ac/public-schema-status` returns 200 and `clinicRegistrationApplications: true`.

## Live verification (fictional data only)

1. `GET /register-clinic` → 200  
2. POST details → review 200  
3. POST `action=confirm` → 303 `/register-clinic/success?ref=AC-…`  
4. DB: one row `status=pending_review`  
5. No new `platform.organizations` / published HCO for that name  
6. Duplicate POST → 400 recently submitted  
7. `GET /clinics` → 200 (not 503)  
8. `GET /healthz` → 200  

Mark the verification application as withdrawn/rejected in the normal review workflow so it is not treated as a real clinic.

## Rollback

Application code can be reverted via prior SHA. Do **not** roll back applied migrations; use append-only repairs if needed.
