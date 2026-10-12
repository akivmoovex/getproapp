# V2.09 Browser Registration and Authentication QA

## Results

- ActiveClinic clinic registration: PASS (previously verified)
- ActiveClinic administrator dashboard and refresh: PASS (previously verified)
- ActiveClinic administrator logout/relogin: NOT_RUN in this pass
- ActiveClinic invalid-password and tenant-isolation checks: NOT_RUN
- BlessBoard church registration: BLOCKED by local server readiness timeout
- BlessBoard HQ/branch lifecycle: NOT_RUN

Chromium host mapping was configured for local-only traffic. The attempted
BlessBoard navigation did not reach the application because the local server
was not accepting connections before the bounded browser step; no product
response or database mutation was observed.

No product defect was confirmed. Three bounded startup/shutdown cycles later
passed in 461ms, 458ms, and 464ms with health readiness. The remaining
logout/relogin attempt blocked waiting for the previously registered
credential to reach `/app`; no new browser result is claimed.

The fresh deterministic AC scenario also blocked before its first result
checkpoint while waiting for the registration completion/navigation condition.
It was stopped at the bounded task limit. No BB browser submission was executed
in this run, and no product defect was confirmed.

## V2.09 Navigation Smoke (2026-10-13)

Using the canonical launcher on an isolated local port and Chromium host
mapping, all four bounded `domcontentloaded` probes passed:

- ActiveClinic `/register-clinic`: HTTP 200
- ActiveClinic `/login`: HTTP 200
- BlessBoard `/register-church`: HTTP 200
- BlessBoard `/login`: HTTP 200

The requested full registration/authentication lifecycles were not completed
in this run; no persistence or authentication PASS is claimed.

## AC Identity Retest

The original 400 was caused by the test fixture reusing the fixed phone
number `971234567`; ActiveClinic matched the existing shared identity and
correctly rejected the supplied password. The test now generates a unique
phone and email per run. Registration reached the authenticated dashboard,
but the retest stopped at the logout control because the visible menu control
was not opened. No authentication bypass or product defect was found.

## Complete AC Lifecycle Retest

The dashboard profile group is opened before clicking the visible `Sign out`
control. The focused lifecycle passed twice with unique email/phone identities,
covering registration, persistence, dashboard, refresh, logout, relogin, and
incorrect-password rejection. Persistence uses the actual
`legal_name`/`public_name` columns.
