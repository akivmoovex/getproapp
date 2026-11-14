# AC-05 negative authorization tests

All of these ran in process on 2026-11-14 against a query double. None opened a database connection. None is the live G3 denial.

| Case | Request | Result |
|---|---|---|
| Administrator read | Active session, assignment row present, `GET /admin/settings/test-database` | 200, page title present, no write SQL |
| Lower privilege | Active session, assignment query empty, same GET | 403, platform-administration message, page title absent |
| Preview denial | Same lower-privilege session, `GET /admin/settings/test-database/preview?scope=selected_test_tenant` | 403, not 401 |
| Missing authentication | No session, same GET | 303 `/login?next=`, not 403 |
| Non-apex host | Administrator session, apex check false | 503 |
| Production deployment | Administrator session, `DEPLOYMENT_ENV=production` | 403, test-database unavailable, page title absent |
| Missing role | Same as lower privilege: the catalogue query returns no platform-scoped row | 403 |
| Wrong tenant | `assignBlessBoardRole` for `organisation_administrator` without a church key | `invalid_input:church_hq_admin_scope` before any query |
| Role escalation | `platform_administrator` with a church key | `invalid_input:platform_admin_scope` before any query |
| Wrong facility | Lower-privilege GET with `facility_id` query and `X-Facility-Id` | 403. The route has no facility dimension |
| CSRF | Administrator `POST /admin/domains/qa.example/status` without a token | 303 `error=csrf`, no write SQL |
| CSRF before authorization | Same POST as the lower-privilege user | 403 before the CSRF redirect |

The fixture plan `buildAc05EvidencePlan` is synthetic and `persisted: false`. `applyActiveClinicFixtures` throws `V13_FIXTURE_HOLD` when the write flags are unset. No identity was inserted.
