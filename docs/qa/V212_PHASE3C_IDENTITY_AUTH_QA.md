# V2.12 Phase 3C Identity and Authentication QA

## Root cause

`no_active_role` was caused by an invalid synthetic setup: the manually-created organization was not associated with the active `blessboard-org-staging` deployment contract. Direct insertion of a `platform_administrator` role row did not establish the supported deployment relationship.

## Supported contract verified

`provisionPlatformTenant` → `provisionBlessBoardChurch` → `createBlessBoardUser` → `assignBlessBoardRole`.

The resulting user had:

- bcrypt password hash
- active user status
- organization product enrollment
- active deployment association
- active `platform_administrator` catalogue role
- platform scope

Credentials were generated in process only and were not written to repository files or reports.

## HTTP evidence

- Login: `303` to `/admin`
- Session: deployment session cookie created and session loaded
- Admin Console Test Database Management page: `200`
- Read-only preview: `200`
- Tenant administrator: `403`
- Unauthenticated request: redirect to login
- Secret redaction: passed
- Preview did not change organization counts

## Remaining scope

The authenticated BlessBoard path is verified. Complete ActiveClinic authenticated fixture coverage and the destructive reset contract remain blocked.
