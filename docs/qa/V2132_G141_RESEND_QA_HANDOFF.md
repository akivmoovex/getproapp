# V2.13.2 G141 — Resend QA handoff

Implementation commit `d97b57d98553367338a0d8f90f75d2a8063f5c8a` on branch `V13`. This file does not record its own commit. Base `500d648f8e4bace54d6291567ea73057920c9c07`. BlessBoard and ActiveClinic stay `2.13.2`. QA is NO-GO. The release is not ready. Nothing was deployed.

## Resend

| Item | Result |
| --- | --- |
| Adapter | Implemented in `src/platform/email/resendEmailAdapter.js` and `src/platform/email/resendOtpTransport.js` |
| Account | NOT_CONNECTED. Resend MCP was unavailable and `RESEND_API_KEY` was unset |
| Plan | NOT_OBSERVED. Free plan was the requested target |
| BlessBoard domain | `notify.blessboard.com` — NOT_VERIFIED |
| ActiveClinic domain | `notify.activeclinic.org` — NOT_VERIFIED |
| PROnline domain | `notify.pronline.org` — NOT_VERIFIED |
| NEUniversity | NOT_CONFIGURED |
| DNS records | NOT_VERIFIED. No DNS change was made and no record values were invented |
| API key | NOT_CONFIGURED. No key was written to git |
| Email delivery | NOT_TESTED against Resend. Automated tests used mock fetch only |

Production OTP stays disabled. Migration `048` was not created and no new migration was executed. Public booking and production media upload stay disabled.

## Tests

Each pair below is two separate runs. The counts are not added together.

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Database-free | 569 executed, 567 passed, 0 failed, 2 skipped | 569 executed, 567 passed, 0 failed, 2 skipped |
| HTTP on `getpro_v13_e2e_g78d2301` port 55432 | 35 executed, 32 passed, 3 failed | 35 executed, 32 passed, 3 failed |
| Playwright | ActiveClinic 26 passed, BlessBoard 23 passed, 0 failed | ActiveClinic 26 passed, BlessBoard 23 passed, 0 failed |

The three HTTP failures are unchanged: D14C challenge persistence, D16 platform OTP, and D25 slot capacity. D25 overlap and the two-client same-staff test passed in both HTTP runs. D25 slot remains `BLOCKED_APPROVAL_REQUIRED`.

New automated coverage:

- 5 unit tests in `tests/v13/unit/g140-resend-transport.test.js`. They assert product sender routing, an unverified domain, a missing key, an invalid recipient, a sender outside the verified set, HTTP 401 without the key or the code `654321` in logs, three tries then `retry_exhausted` for timeout and HTTP 429, one send plus duplicate suppression, production OTP staying blocked, and templates without clinical text.
- 3 contract tests in `tests/v13/contract/g141-otp-resend-contract.test.js`. They keep BlessBoard recovery, ActiveClinic patient recovery, and ActiveClinic staff recovery on the shared adapter, require a verified domain before routing, and keep production activation blocked.
- No new integration file. The integration file count stays 19. Mock Resend calls are inside the unit tests. No real email was sent.
- 4 named browser tests. ActiveClinic Playwright is 26, up from 22. BlessBoard stays 23.

## November 23 scenario traceability

| QA ID | Evidence | Status |
| --- | --- | --- |
| AC-FU-PORTAL-01 | Named browser test in both ActiveClinic cycles | VERIFIED_LOCAL_E2E |
| AC-FU-PORTAL-02 | Unknown registration does not insert a patient | POLICY_MISMATCH |
| AC-FU-PORTAL-03 | `AC-PUB-01` passed. Public booking stays disabled | BLOCKED_BY_POLICY |
| AC-FU-PORTAL-04 | `platform.otp_challenges` is absent. D14C and D16 failed | BLOCKED_BY_MIGRATION |
| AC-FU-WEB-01 | `AC-WEB-08` passed in both cycles | VERIFIED_LOCAL_E2E |
| AC-FU-WEB-02 | Named browser test in both cycles. Binary upload was not run | VERIFIED_LOCAL_E2E |
| AC-FU-WEB-03 | `AC-WEB-09` passed in both cycles | VERIFIED_LOCAL_E2E |
| AC-FU-REC-01 | Staff create inside `AC-FU-PORTAL-01` | VERIFIED_LOCAL_E2E |
| AC-FU-REC-02 | `AC-REC-02` passed in both cycles | VERIFIED_LOCAL_E2E |
| AC-FU-REC-03 | Named test creates a patient, walks them in, and the queue body contains that patient number. Passed in both official cycles | VERIFIED_LOCAL_E2E |
| AC-FU-REC-04 | Named test uses the fixture patient number. Both official cycles stayed on the walk-in page with "already has an active queue entry" and the organization-scoped patient count did not change. A probe before those cycles had reached the queue URL. The official cycles prove recognition and no second chart | VERIFIED_LOCAL_E2E |
| AC-FU-REC-05 | Named test signs in as clinical staff, opens `/app/clinical`, and sees "Practitioner worklist". It does not assert a specific reception ticket | VERIFIED_LOCAL_E2E |
| AC-FU-CLIN-01 | Named test shows the start-encounter link and a row action on `/app/clinical`. It does not start an encounter. Passed in both cycles | VERIFIED_LOCAL_E2E |
| AC-FU-CLIN-02 | `AC-REC-03` passed in both cycles | VERIFIED_LOCAL_E2E |
| AC-FU-CLIN-03 | `AC-REC-03` appends a correction and the HTTP stale retry stays rejected | VERIFIED_LOCAL_E2E |

## Blockers

- Resend is not connected, no domain is verified, and no API key is configured.
- `platform.otp_challenges` is absent, so D14C and D16 stay failed.
- D25 slot capacity has no approved integer.
- Hosted QA was not run.

Next action: an operator adds the three domains in Resend, copies the DNS records from the Resend dashboard, and stores a sending-only key outside git. Do not apply an OTP migration or send a live message until that verification and a separate approval exist.
