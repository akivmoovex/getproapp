# V2134 G331 autonomous execution report

FINAL=V2134_G331_AUTONOMOUS_QA_AND_STITCH

START_SHA=`d5c5369d22fd825938fe1a9692dadee19bfd4a93`  
APPLICATION_SHA=`e1cafcea90871da89547c0937208297416cb7b53`  
BRANCH=`V13`  
MAIN=`44eafec486a18aeef2777bbcc9683e43f68ebe0d` unchanged  

QA_GO_NO_GO=NO-GO.  
RELEASE_READY=NO.

This session pushed one reviewed application checkpoint. It did not change `main`, did not run a hosted migration, did not write a hosted patient or clinic row, did not send email, did not enable SMS, Community Benefits posting, or public booking.

## What was executed

The G329 public-booking patch was reviewed, tested, committed as `e1cafcea90871da89547c0937208297416cb7b53`, and pushed to `origin/V13`. Hostinger automatic deployment was already active, so that push was treated as a testing deployment.

Both `/healthz` endpoints then returned `gitSha=e1cafcea9087`, `environment=testing`, `deploymentCode=moovex-platform-testing`, `ok=true`, and `schemaCompatible=true`.

Anonymous GET:

| URL | HTTP | Wizard |
| --- | --- | --- |
| `/clinics/julflona-clinic/book` | 403 | absent. Body contains `Online booking is not currently offered` |
| `/clinics/activeclinic-demo/book` | 403 | absent. Same sentence |
| `/clinics/g331-unknown-clinic/book` | 404 | absent |

No hosted booking POST was sent.

Local suites on `127.0.0.1:55432` / `getpro_v13_e2e_g78d2301`, with `GETPRO_AC_PUBLIC_BOOKING_ADMISSION` unset:

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Booking unit focus (11 tests) | 11/11 | 11/11 |
| `npm run test:v13:contract` | 687/687 | 687/687 |
| `.v13-isolated-pg/g79-run.cjs` | 41/41 | 41/41 |
| `npm run test:v13:otp-security` | 15/15 | 15/15 |
| ActiveClinic email OTP browser | 9/9 | 9/9 |
| BlessBoard member OTP browser | 10/10 | 10/10 |
| ActiveClinic platform browser | 36/36 | 36/36 |
| BlessBoard platform browser | 23/23 | 23/23 |

Preflight refused any database other than the isolated one and refused a run when `public_booking_enabled` was not all false.

## What was not executed

Live Resend delivery. Mandatory credentials and an approved recipient were absent from this process. `LIVE_EMAIL_OTP=BLOCKED`. `PROVIDER_DELIVERY=NOT_VERIFIED`. No mailbox receipt exists.

Platform migration `048` was not created and not applied.

Stitch visual waves were not implemented. Live inventories were read. Mobile frames in the public project are 780 pixels wide, which the earlier audit already flagged as the wrong chrome to copy. A visual rewrite was not pushed.

The 64 hosted write cases were not run. Historical local results from G325 were not re-executed as 64 separate scripts in this session. The suites above cover booking denial, staff appointment overlap, portal activation, laboratory, radiology, pharmacy, website, and OTP recovery.

Hosted backup evidence is still none.

## Preserved local files

`bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` stayed untracked.
