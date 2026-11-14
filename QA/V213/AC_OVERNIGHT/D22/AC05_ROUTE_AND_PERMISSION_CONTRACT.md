# AC-05 route and permission contract

Source: `docs/qa/V212_AC_ADMIN_NEGATIVE_RBAC.md` and `docs/qa/V212_RELEASE_CANDIDATE_FREEZE_REVIEW.md`. Baseline `origin/V13` `b8f6b420d25e908de64ba292866c218c32edc30c`.

The protected operations are the apex platform-admin shell and Test Database Management:

| Method | Path | Gate |
|---|---|---|
| GET | `/admin` | `requireApex`, `requirePlatformAdmin` |
| GET | `/admin/settings/test-database` | `requireApex`, `requirePlatformAdmin` |
| GET | `/admin/settings/test-database/preview` | `requireApex`, `requirePlatformAdmin` |

`requireApex` returns 503 when the host is not an apex host. `127.0.0.1` and `localhost` are local apex aliases.

`requirePlatformAdmin` reads `req.v5Session`. A missing or inactive session on these GET routes redirects to `/login` with status 303. A non-GET request that does not accept HTML receives 401. An active session is then checked with `hasActivePlatformAdministratorAssignment`: an active `platform_administrator` catalogue assignment whose `scope_type` is `platform`. Any other active user receives 403 and the text `You do not have access to platform administration`. The failure category is `missing_platform_administrator_catalogue_role`.

The test-database handlers run only after that gate. `inspectTestDatabase` also refuses a runtime whose `DEPLOYMENT_ENV` is not `testing`, and `assertDatabaseTestingIdentity` refuses a database identity that is not a testing key. That second 403 says `Test database management is unavailable`. It is a deployment-identity block, not the lower-privilege denial.

The route does not take a facility id. Facility is not part of this contract.

Assigning `organisation_administrator` or `church_system_administrator` without a church key returns `invalid_input:church_hq_admin_scope` before a query. Assigning `platform_administrator` with a church or branch key returns `invalid_input:platform_admin_scope`. Those refusals stay in place. They are not changed to create a test user.

`/app/billing` is a different permission. It is not this contract.

Synthetic identities, not persisted:

| Identity | User id | Role |
|---|---|---|
| Administrator | `11111111-1111-4111-8111-111111111111` | `platform_administrator`, platform scope |
| Lower privilege | `22222222-2222-4222-8222-222222222222` | no catalogue role |

Emails `platform-admin@v13d19.example` and `tenant-reader@v13d19.example` are labels only. No password is stored in the evidence plan.
