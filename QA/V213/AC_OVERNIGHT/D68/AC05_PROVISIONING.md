# AC-05 provisioning

The evidence plan in `buildAc05EvidencePlan` is `persisted: false`. No user was inserted.

| Identity | Requirement |
|---|---|
| Administrator | `platform-admin@v13d19.example`, role `platform_administrator`, scope type `platform` |
| Lower privilege | `tenant-reader@v13d19.example`, no platform-administrator assignment |
| Refused assignment | `organisation_administrator` on `v13d19-clinic-a` is not a platform-admin grant |

Routes, each behind `requireApex` and `requirePlatformAdmin`:

- `GET /admin`
- `GET /admin/settings/test-database`
- `GET /admin/settings/test-database/preview`

A missing session redirects to `/login`. That redirect is not the denial. `401` is not the denial. The lower-privilege session must receive HTTP 403, and the body must not contain `Test Database Management`. The receptionist billing 403 is a different check.

The browser steps read `E2E_AC05_LOWER_EMAIL` and `E2E_AC05_LOWER_PASSWORD` only after `hold()` returns. Those variables were not set, and the browser was not opened.

`applyActiveClinicFixtures` does not create either AC-05 identity. A later run still needs a provision step that inserts them into the run-owned database. That step was not written or run here.
