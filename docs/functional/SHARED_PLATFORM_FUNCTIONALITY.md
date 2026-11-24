# Shared platform functionality

Shared OTP persistence stays blocked because `platform.otp_challenges` is not authorized. The appointment slot lock and the in-transaction staff overlap stay unimplemented. G110 did not create the table and did not add a lock. An empty website image no longer requests the current page, which had been rotating the CSRF cookie. Single-site church contact now posts on `/c/:organizationKey/contact`.

Both products use the same session, CSRF, OTP, organisation, and job services. Product version is 2.13.1 in `src/platform/build/applicationBuildInfo.js`. G65–G82 did not change OTP delivery, CSRF, or tenant isolation. Production OTP delivery stays inactive. `platform.otp_challenges` is still absent by contract. G82 did not add that migration. The local-browser domain exception accepts `local.test` only when the profile is `testing`, the host is `127.0.0.1`, `NODE_ENV` is `test`, and `GETPRO_V13_BROWSER_AUTHORIZED` is `1`. Production profiles stay refused.

| Area | Status | Current behavior | Next action |
| --- | --- | --- | --- |
| Tenant configuration | IMPLEMENTED_UNVERIFIED | Organisation selection and product enablement | Isolated HTTP |
| Facility and branch settings | IMPLEMENTED_UNVERIFIED | Facility select for ActiveClinic; branch scope for BlessBoard | Isolated HTTP |
| User lifecycle | IMPLEMENTED_UNVERIFIED | Registration, invitation, and first login | Isolated INV-01 |
| Role assignment | IMPLEMENTED_UNVERIFIED | Scope must match the role. Receptionist plus organisation scope is `invalid_scope` | Do not widen scopes |
| Account recovery | IMPLEMENTED_UNVERIFIED | Testing outbox. Neutral response | Do not call a production provider |
| CSRF | IMPLEMENTED_UNVERIFIED | `renderShell` reuses the token the page already issued. Mismatch is 403 | Do not bypass |
| OTP | IMPLEMENTED_UNVERIFIED | Fail-closed. Replay rejected | Isolated D16 only in testing mode |
| Audit | IMPLEMENTED_UNVERIFIED | Sensitive values are redacted | Isolated HTTP |
| Exports | BLOCKED | `runDataJobExport` exists | Do not execute |
| Reporting authorization | IMPLEMENTED_UNVERIFIED | Billing revenue report requires the billing permission and a facility | Do not add a clinical narrative report |
| Pagination | NOT_DEMONSTRATED | Existing lists have their current limits | No new pager in this phase |
| Error handling | IMPLEMENTED_UNVERIFIED | 403, 404, and validation results stay specific | Do not collapse them to 200 |
| Input validation | IMPLEMENTED_UNVERIFIED | UUID and field checks run before writes | Keep them |
| Accessibility | BLOCKED | No audit was run | Do not claim a pass |
| Responsive forms | NOT_DEMONSTRATED | Existing templates were not remeasured | A later browser pass |
| Operational logging | NOT_DEMONSTRATED | Process logs exist. No new operational dashboard | Do not add a monitor |
| Monitoring | BLOCKED | No approved monitor contract | Leave it |
| Backup and restore | BLOCKED | Documented only. No restore tool | Do not claim recovery |
| Recovery procedure | NOT_DEMONSTRATED | `/app/offline` returns 503 and does not write | Do not start a sync engine |
| Data portability | BLOCKED | Export job not run | Isolated job only when authorized |

CI workflows that can run database stages stay `if: false` and are `workflow_dispatch`. A push to V13 does not start them. Branches in the main CI file remain `main`, `v2`, and `V7`.
