# V2134 G334 email delivery audit

STATUS=ADAPTER_READY_DELIVERY_BLOCKED  
LIVE_EMAIL_SENT=NO  
MAILBOX_RECEIPT=NOT_VERIFIED  
ORIGINAL_DOCX=NOT_REOPENED

This session did not find `~/Downloads/ActiveClinic_V2.13.4_Christine_64_Scenario_Regression_Report.docx`. The historical results below come from the committed G324, G325, and G331 matrices. G324 records that the original attachment was read then and was not committed.

ActiveClinic and BlessBoard share one OTP service and one Resend transport.

| Step | ActiveClinic | BlessBoard |
| --- | --- | --- |
| Request | Staff login, patient login, password recovery | Member login, password recovery |
| Account check | Password or recovery lookup before a challenge | Member credentials before a challenge |
| Challenge | `platform.otp_challenges`, purpose `login` or `password_recovery` | Same store and purposes |
| Provider | `GETPRO_OTP_PROVIDER=resend` uses `createResendOtpEmailTransport` | Same function |
| Acceptance | HTTP 2xx plus a provider message id. `delivered` stays false | Same |
| Mailbox | Not verified | Not verified |
| Session | Issued only after the code verifies | Issued only after the code verifies |

The process environment has no `RESEND_API_KEY`, verified-domain list, sender profile, QA recipient, or `GETPRO_OTP_EMAIL_DELIVERY`. Hosted `NODE_ENV=production` keeps OTP activation blocked, so the new catalog path cannot send on the testing hosts.

SMS recovery is not a success path. An SMS channel without an approved gateway returns a failed delivery. Public booking stays disabled. The isolated preflight refuses a database that has `public_booking_enabled`.

## Schema

`platform.otp_challenges` exists on `getpro_v13_e2e_g78d2301` and is not in `platform.schema_migrations`. The platform ledger stops at `047`. The source contracts require `db/migrations/platform/048_otp_challenges.sql` to stay absent until a separate approval. This gate did not add or apply that file.

The live isolated table stores hashes only. It has a unique `attempt_id`, a pending lookup index, product and channel checks, a five-attempt cap, and a verified-status check that requires `verified_at`. Consumption is a conditional update in `otpPostgresStore.js`. A restart can still verify a stored hash when the pepper is unchanged. The QA observer code map is process memory and is not that store.
