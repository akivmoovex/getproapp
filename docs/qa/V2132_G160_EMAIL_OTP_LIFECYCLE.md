# G160 email OTP lifecycle

| Stage | Status |
| --- | --- |
| Challenge request | Route exists. Production activation stays blocked. |
| Challenge generation | Service exists. A production code is not issued when the table is absent. |
| Challenge persistence | Blocked. `platform.otp_challenges` is absent. |
| Email provider request | Adapter exists and is covered by mocked tests in the safe suite. No live request was made. |
| Provider acknowledgement | Not observed. |
| Delivery | Not observed. Provider acceptance would not prove delivery. |
| User code entry | Browser gate stays on the blocked state. No code was shown. |
| Challenge verification | D16 second-worker test fails because the table is absent. |
| Attempt limits | Adapter retry exhaustion is unit-tested. It is not a live OTP. |
| Single-use consumption | Cannot be proven until a row can be stored. |
| Session activation | Production OTP activation stays blocked. |

D14C and D16 failed in both HTTP runs. The tests were not skipped and were not changed to pass. Migration `048` was not created and was not applied.

Mock coverage in the safe suite includes exact domain matching of `pronline.org` against `notify.pronline.org`, missing key, invalid sender, provider 401 and 429, retry exhaustion, and redaction. Those mocks do not make the lifecycle ready.

`RESEND_REAL_EMAIL_SENT=NO`. `OTP_FULL_FLOW_READY=NO`.
