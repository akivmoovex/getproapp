# ActiveClinic — Directory Repair Deployment

**Date:** 2026-08-04  
**Target:** `activeclinic.org` (`activeclinic-org-v6`)  

## What fixed live `/clinics`

The Hostinger testing database had **zero** ActiveClinic migrations. Applying `activeclinic/001–020` (plus required platform/blessboard prerequisites) restored schema. No Hostinger Node restart was required for the query path once tables existed (same live DB).

## Migration action taken

1. Verified `platform.database_identity.environment_code = testing`.
2. Applied pending non-seed migrations (41 files): platform `018–026`, blessboard `076–087`, activeclinic `001–020`.
3. Did **not** rewrite drifted `seeds/001`.
4. Left `seeds/004` pending (optional).

## Application code follow-up

Push commit with directory structured logging + request ID on error state, then redeploy/restart ActiveClinic when convenient (logging only; schema fix already live).

## Verify

```bash
curl -sS https://activeclinic.org/__ac/public-schema-status
curl -sS -o /dev/null -w "%{http_code}\n" https://activeclinic.org/clinics
```

Expect schema `ok: true` and `/clinics` HTTP 200.
