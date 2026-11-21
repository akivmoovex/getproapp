# V2.13.1 D13 — authentication and registration fixes

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D12 files were left in place. No database, role, migration, browser, or production OTP was used.

Safe contract and unit tests: 413 passed, 0 failed. The D04 HTTP and Playwright suites were not executed. None of these fixes is verified by an authorized regression pass.

## AC-REG-01

A second clinic on the same normalized phone is allowed only when the password matches the existing identity. If no identity exists yet, the password must match a non-rejected application for that phone. A mismatch returns a field error and does not insert another application.

The check and insert share a transaction advisory lock on the normalized phone, so two concurrent registrations cannot both pass the check. If provisioning later rejects the contact for an authorization failure, and the application still has no organization, that application and its review events are deleted. A provisioned clinic is not deleted.

Matching credentials still reuse the identity and can create the second clinic. The identity password wins over an older application hash.

## BB-REG-07

Occupying church phones now include `active` and `duplicate_review`, using the same predicate as the application insert. A different email on that phone is rejected with “already linked to a BlessBoard church registration”. A unique-index violation is mapped to that same message. The public response does not include the SQL state or constraint name. Same-email retries stay idempotent.

## AC-AUTH-04

The forgot-password flow already creates a testing-only outbox, keeps the check page neutral, rejects an invalid, mismatched, expired, or replayed token, and sends a successful reset to the staff shell. No further source change was required. Real email delivery stays on the normal adapter and was not exercised.

## BB-AUTH-04

Member recovery HTML no longer renders a testing OTP. Tests still read the code from `peekTestCode`. A recovery submission must use the verification id stored in the signed draft, and the OTP row must belong to that member, before the password changes. An expired, wrong, or already used code still fails closed. The test provider stays unavailable when `NODE_ENV`, `DEPLOYMENT_ENV`, or the deployment profile is production. No production OTP was sent.

## Still blocked

Authorized HTTP and browser runs are not done. The disposable database and least-privilege role from D12 were not created.
