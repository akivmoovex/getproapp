# V2134 G333 patient login OTP browser

STATUS=PASS  
SUITE=`tests/e2e/v13/v13-ac-patient-login-otp.spec.js`  
CLOSED=`tests/e2e/v13/v13-ac-patient-login-otp-closed.spec.js`  
DATABASE=getpro_v13_e2e_g78d2301  
HOST=127.0.0.1:55432  
RUNS=7/7 and 7/7 after the renderer fix, closed 1/1 and 1/1

Each patient is created in the fixture clinic by staff, then activated through the public register form. No hosted patient data is used.

| Case | Result |
| --- | --- |
| Staff-created patient can sign in | Pass. Register lands on the patient login page. |
| Password before the code | Pass. The code form appears only after the password. |
| No portal session before the code | Pass. No session cookie. `GET /clinics/:key/patient` redirects. |
| Correct code | Pass. Portal opens for that patient number. The other fixture number is absent. |
| Incorrect code | Pass. Reason `invalid_code`. No session. |
| Expired code | Pass. Reason `expired`. No session. |
| Replay | Pass. Restoring the challenge cookie and posting the same code returns 401. Open sessions stay 1. Logout clears the cookie and the profile redirects. |
| Other patient | Pass. Swapping `account_id` returns `verification_failed`. No session. |
| Other clinic | Pass. Posting the code to the other clinic key returns 401. No session. |
| Unmatched registration | Pass. The page says no matching patient record. The patient count for that phone is unchanged. |
| Activation | Pass. The staff chart plus matching public registration still creates the portal login. |
| Password recovery binding | Pass. Forgot-password stays on the testing unavailable path. The reset token row belongs to that patient's email. |
| Missing provider | Pass. Observer flag on, provider unset. "Sign-in is temporarily unavailable." once, no code form, no session, portal redirects. |

## Defects fixed while running this suite

The first patient run returned the public error page. `renderPatientView` dropped `otpAttemptId`, `otpReason`, and `maskedDestination`, and `login-otp.ejs` then threw. Those fields are now part of the patient view locals, and both OTP renders pass the clinic record rather than the route context.

A later setup run stopped on the first chart because the new patient matched an earlier G333 chart. The suite now uses a unique name and date of birth per run. That failed setup is not counted above.

The missing-provider page was announcing the same sentence on the banner and on the phone field, because the shared phone partial inherits the page `error`. Patient login now passes an empty field error, so the banner is the only alert. The closed suite checks that `#identifier-error` is absent.
