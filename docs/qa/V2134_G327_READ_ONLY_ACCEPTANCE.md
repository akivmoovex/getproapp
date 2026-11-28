# V2134 G327 read-only hosted acceptance

HOSTED_ACCEPTANCE_EXECUTED=PARTIAL_READ_ONLY.

The executed rows below were anonymous HTTP GET requests. No form was posted. No clinic, patient, encounter, vital, laboratory result, radiology result, website publish, password change, OTP, or financial transaction was created.

Both `/healthz` endpoints returned `gitSha=5550bc0eabf7` at the start and at the end of this pass. The full SHA is `5550bc0eabf7aa66bc9335555fc7d4e57eb72416`. `environment=testing` and `deploymentCode=moovex-platform-testing`. If a later read shows a different SHA, this sheet is evidence only for `5550bc0eabf7`.

The named candidate `c947d26cb57e` was not running. These rows are not acceptance of that older SHA.

## Which rows are strictly read-only

| Class | Rows | This session |
| --- | --- | --- |
| Anonymous public GET can meet the expected result | RT-01, RT-02, RT-03 | Executed |
| The page can be read, and the scenario still needs a submit or a signed-in action | RT-04, RT-05, RT-06, RT-08, RT-31 | Not executed |
| Sign-in, registration, clinical write, website write, or mailbox delivery | RT-07, RT-09 through RT-30, RT-32 through RT-64 except the rows named above | Not executed |

RT-07 stays provider-blocked until a received mailbox message exists. RT-08 stays policy-disabled until an approved recovery check shows that no SMS is sent. RT-31 stays the chart-first refusal and was not attempted. RT-03 was expected to stay unavailable. The read showed a booking wizard, so the row is a read-only failure rather than a policy confirmation.

## Executed rows

| ID | Expected | Actual | Result | Evidence |
| --- | --- | --- | --- | --- |
| RT-01 | ActiveClinic public origin loads | `https://activeclinic.pronline.org/` returned 200, title ActiveClinic | PASS | GET on `5550bc0eabf7` |
| RT-02 | One published clinic page shows published information | `https://activeclinic.pronline.org/clinics/julflona-clinic` returned 200 and shows the demonstration clinic welcome, hours, and location | PASS | GET on `5550bc0eabf7`. Demonstration content only |
| RT-03 | Booking stays unavailable | `GET /clinics/julflona-clinic/book` and `GET /clinics/activeclinic-demo/book` returned 200 and the appointment wizard. The unavailable page was not returned. The wizard says online booking is available when the clinic enables it, and that SMS reminders are not sent. No booking was submitted | FAIL | GET only. Nothing was enabled or disabled |

BlessBoard `https://blessboard.pronline.org/about` and ActiveClinic `/about` both showed 2.13.4 on this SHA. Those are version reads, not extra scenario rows.

`GET /forgot-password` returned 200. The page does not mention SMS. It says a reset link will be sent if an eligible account exists, and that automated delivery may be unavailable. The form was not submitted. RT-08 remains NOT_RUN.

`GET /login` returned 200. No password was sent. RT-04, RT-05, and RT-06 remain NOT_RUN.

## Unexecuted rows

RT-04, RT-05, RT-06, RT-07, RT-08, RT-09, RT-10, RT-11, RT-12, RT-13, RT-14, RT-15, RT-16, RT-17, RT-18, RT-19, RT-20, RT-21, RT-22, RT-23, RT-24, RT-25, RT-26, RT-27, RT-28, RT-29, RT-30, RT-31, RT-32, RT-33, RT-34, RT-35, RT-36, RT-37, RT-38, RT-39, RT-40, RT-41, RT-42, RT-43, RT-44, RT-45, RT-46, RT-47, RT-48, RT-49, RT-50, RT-51, RT-52, RT-53, RT-54, RT-55, RT-56, RT-57, RT-58, RT-59, RT-60, RT-61, RT-62, RT-63, and RT-64 are NOT_RUN.

## Counts

| Bucket | Count |
| --- | --- |
| Read-only PASS | 2 (RT-01, RT-02) |
| Read-only FAIL | 1 (RT-03) |
| NOT_RUN | 61 |
| Supported enabled hosted PASS | 0 |
| Policy-disabled confirmed | 0 |
| Provider-blocked confirmed on the host | 0 |
| Chart-first refusal executed | 0 |

READ_ONLY_HOSTED_CHECKS_PASS=2.  
READ_ONLY_HOSTED_CHECKS_FAIL=1.  
READ_ONLY_HOSTED_CHECKS_NOT_RUN=61.

Release acceptance stays NO-GO. These three reads are not the 64-scenario hosted acceptance.
