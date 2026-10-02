# ActiveClinic — Clinic Directory Unavailable Root Cause

**Date:** 2026-08-04  
**Branch:** `V6`  
**Live URL:** https://activeclinic.org/clinics  

## Exact root cause

| Item | Value |
|------|-------|
| Route | `GET /clinics` |
| Service | `fetchDirectoryClinics` → `listPublishableClinics` |
| Repository / SQL | JOIN `activeclinic.healthcare_organizations` + `activeclinic.facilities` with `h.website_published = true` and `f.show_in_directory = true` |
| Failure | PostgreSQL **`42P01`** — schema/relation missing (`activeclinic` module never migrated on the Hostinger testing DB) |
| Safe category | `schema_missing` |
| User symptom | HTTP **503** controlled error page (“Directory temporarily unavailable”) |

Live confirmation via `GET /__ac/public-schema-status` **before** repair:

```json
{
  "ok": false,
  "schema": {
    "schemaExists": false,
    "healthcareOrganizations": false,
    "websitePublishedColumn": false,
    "clinicRegistrationApplications": false
  },
  "activeclinicMigrationsApplied": [],
  "pendingHint": "apply_activeclinic_migrations_001_through_020"
}
```

Same root cause family as clinic registration failure (missing ActiveClinic migrations on the shared testing database with `environment_code=testing`).

## Code path

```
GET /clinics
→ activeClinicPublicRoutes
→ resolveDirectorySearchQuery
→ listPublishableClinics (activeClinicPublicVisibilityService)
→ SQL against activeclinic.healthcare_organizations / facilities
→ render clinics-directory.ejs (ready | empty | error)
```

## Repair applied

1. **Database:** Applied pending migrations on the ActiveClinic Hostinger testing database (identity `environment_code=testing`): platform `018–026`, blessboard `076–087`, activeclinic `001–020`. Skipped drifted `seeds/001` (checksum drift left unresolved; not required for directory).
2. **Code:** Structured directory load success/failure logs + request ID on error state.
3. Empty directory now returns **HTTP 200** with Stitch empty state when schema is present and zero clinics are published.

## Live evidence after migrate

| Probe | Result |
|-------|--------|
| `/__ac/public-schema-status` | **200**, `ok: true`, AC migrations 001–020 listed |
| `/clinics` | **200**, `data-ac-directory-state="empty"` |
| `/clinics?q=zzzz…` | **200**, empty/no-match |
| `/register-clinic` confirm | **303** success (same schema fix) |

## Remaining notes

- Seed `004_activeclinic_product_and_deployment.sql` remains pending (optional product/deployment catalogue seed).
- Seed `001_deployments.sql` reports checksum **drift** — do not rewrite; investigate separately.
- No published demo clinic was hard-coded; empty state is correct until a clinic is published through normal rules.
