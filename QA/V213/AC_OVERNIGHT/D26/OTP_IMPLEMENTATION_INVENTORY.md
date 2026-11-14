# OTP implementation inventory

Branch `V13` at `b8f6b420d25e908de64ba292866c218c32edc30c`. The OTP modules under `src/platform/otp/` are uncommitted worktree files. No product file was edited in this stage.

One engine serves BlessBoard and ActiveClinic. `otpWorkflows.js` names the login, recovery, activation, and role-change workflows. Patient portal activation is marked independent of public booking. `activeclinic.public_booking` is not a workflow.

`createOtpService` hashes the code with `GETPRO_OTP_PEPPER` and stores the hash in `createMemoryOtpStore`. The plaintext is not written to the audit row. Delivery goes through a provider whose `deliveryActivated` flag is false. Passing a provider with that flag set throws `otp_delivery_activation_forbidden`.

Protected purposes are `login`, `password_recovery`, and `account_activation`, plus `admin_operation` for role, export, and security-setting actions. Admin actions require a session id. Login does not.

`resolveOtpActivation` returns `BLOCKED` with `migration_not_applied`, `provider_not_configured`, and `release_not_verified`. A production environment stays blocked even when the override is `ACTIVE`. While blocked, `evaluateOtpSessionGate` allows the existing login path and does not complete an OTP session.

There is no `db/migrations/platform/048_otp_challenges.sql`. The design note in `docs/platform/V213_D14A_OTP_FOUNDATION.md` is not an applied migration.
