# Authenticated AC-05 plan

Live denial was not run.

The routes under test are `GET /admin`, `GET /admin/settings/test-database`, and `GET /admin/settings/test-database/preview`. Each still uses `requireApex` and `requirePlatformAdmin`.

`buildAc05EvidencePlan` names two synthetic identities and does not persist them:

| Identity | Email | Role |
|---|---|---|
| Administrator | `platform-admin@v13d19.example` | `platform_administrator`, scope `platform` |
| Lower privilege | `tenant-reader@v13d19.example` | no platform role |

The browser assertion, when the hold is removed, signs in as `E2E_AC05_LOWER_EMAIL` and expects HTTP 403 on both test-database routes. The body must not contain “Test Database Management”. A 401 is not the denial. The cashier billing 403 is a different case and does not close AC-05.

Before the assertion, confirm the disposable database still has the same row counts it had after fixture apply. A denial that changes data is not a pass.

`organisation_administrator` with a church key is specified to fail as `invalid_input:church_hq_admin_scope` before a query. Do not invent a church administrator to satisfy the route.
