# V13 G111 failure inventory

Base SHA `fdee8534d7d3cff44de1a4142dd376ec3eaccc87`. Branch `V13`. Database `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432`.

| TEST_ID | PRODUCT | TEST_FILE | EXPECTED | ACTUAL AT START | ROOT CAUSE | REPAIR |
| --- | --- | --- | --- | --- | --- | --- |
| BB-06 login | BlessBoard | `tests/e2e/v13/v13-bb-qa-regression.spec.js` | Member signs in and reaches the portal | Apex `/member/login` has no church context | The supported portal without a tenant host is `/c/{organizationKey}/member`. The test used the apex and a fixed Church ID | Use the church path, show the Church ID, and keep the URL church |
| INV-01 accept | BlessBoard | same | Accept once and deny replay | `E2E_BB_STAFF_INVITE_TOKEN` was unset | No pre-issued token. The HQ form did not offer a limited role | Issue a website-editor invitation through the existing invite service |
| INV-01 login | BlessBoard | same | Limited staff cannot open member creation | The configured staff email was the church administrator | That account has `members.create` | Sign in as the invited website editor and require the 403 page |
| BB-AUTH-04 | BlessBoard | same | Recovery accepts one hidden code | `E2E_BB_MEMBER_OTP` was unset and the page must not show the code | The test provider keeps the code in the server process | Read it from the testing-only delivery route after the page is rendered |
| D14C | Shared | `tests/v13/integration/d14c-otp-auth.integration.test.js` | Challenge row persists | Throws because `platform.otp_challenges` is absent | Migration is not authorized | Leave the test failing. Design only |
| D16 platform OTP | Shared | `tests/v13/integration/d16-platform-otp.integration.test.js` | Same table | Same throw | Same missing table | Leave the test failing |
| D25 slot | ActiveClinic | `tests/v13/integration/d25-appointment-concurrency.integration.test.js` | Slot lock | `APT-01-03_NOT_IMPLEMENTED` | `evaluateSlotCapacity()` returns `BLOCKED_APPROVAL_REQUIRED` | No new capacity policy |
| D25 overlap | ActiveClinic | same | In-transaction overlap | Overlap check is a SELECT outside the appointment transaction | No approved lock | No new lock |

No tenant hostname was invented. Apex `/member/login` still does not render the member form.
