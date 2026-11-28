# V2134 G333 OTP and mobile hardening

FINAL=V2134_G333_OTP_AND_MOBILE_HARDENING  
BASE_SHA=9d87d73a7957b24b4da79dfbd9160649c0116dea  
HEAD=9d87d73a7957b24b4da79dfbd9160649c0116dea  
ORIGIN_V13=9d87d73a7957b24b4da79dfbd9160649c0116dea  
MAIN=44eafec486a18aeef2777bbcc9683e43f68ebe0d  
HOSTED_RUNNING_SHA=9d87d73a7957b24b4da79dfbd9160649c0116dea  
HOSTED_HOSTS=activeclinic.pronline.org and blessboard.pronline.org  
HOSTED_HEALTH=ok, environment=testing, deploymentCode=moovex-platform-testing  
DATABASE=getpro_v13_e2e_g78d2301 on 127.0.0.1:55432

G332 source files, G332 notes, `bb-lifecycle.log`, and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` are still in the worktree. Nothing was committed, pushed, deployed, or written to a hosted database. Migration 048 was not created or applied. No real email was sent.

## OTP storage

Staff and patient login share `src/platform/otp/otpService.js` and `platform.otp_challenges`.

| Binding | Behavior |
| --- | --- |
| Purpose | Login uses `login`. Password recovery uses `password_recovery`. |
| Organization | The stored organization is compared with the request. A mismatch is `cross_tenant`. |
| Account | Lookup includes the account. A swapped account misses the row and returns `verification_failed`. |
| Product | Rows are `activeclinic` for these logins. |
| Destination | Email is the verified address on the account. The page shows a masked destination. The hash is stored, not the address, in the challenge row. |
| Pepper | `GETPRO_OTP_PEPPER`, or `SESSION_SECRET` when that is unset. Minimum 32 characters. The code is stored as `code_hash`. |
| One-time use | `compareAndVerify` updates a pending, unconsumed, unexpired row. `consumeVerified` then sets `consumed`. A verified or consumed row is a replay. |
| Attempts | Failed attempts increment `attempt_count`. The fifth failure exhausts the row. Cap is 5. |
| Expiration | TTL is 300 seconds. An expired row cannot verify. |
| Resend | A pending row inside 60 seconds returns `resend_cooldown` and does not consume another account slot. |
| Session | Password authentication returns before session creation. The session cookie is issued only after verification, with `protectedActionCompleted: true`. |

A process restart can still verify a challenge. The row and hash are in Postgres, so verification works when the caller retained the code and the pepper is unchanged. The QA observer code map is process memory. After a restart, `/__platform/qa/activeclinic-recovery-otp-delivery` no longer has the code. That route is local QA only.

`db/migrations/platform/048_otp_challenges.sql` is absent. The isolated database already has `platform.otp_challenges` from the approved test schema. A hosted migration is a separate approval. This gate does not add one.

Hosted testing stays inactive: `NODE_ENV=production` keeps OTP activation blocked, and the observer flags are local test flags. Unset or inactive delivery returns "Sign-in is temporarily unavailable." with HTTP 503 and no session.

## Browser evidence

| Suite | Run 1 | Run 2 |
| --- | --- | --- |
| Staff login OTP | 8/8 | 8/8 |
| Staff missing provider | 1/1 | 1/1 |
| Patient login OTP | 7/7 | 7/7 |
| Patient missing provider | 1/1 | 1/1 |
| Website editor 390 / 768 / 1440 | 1/1 | 1/1 |
| Unit and contract | 693/693 | 693/693 |
| HTTP and PostgreSQL, including public booking denial | 41/41 | 41/41 |
| ActiveClinic browser, password-only | 36/36 | 36/36 |
| BlessBoard browser | 23/23 | 23/23 |
| OTP security | 15/15 | 15/15 |
| ActiveClinic recovery OTP browser | 9/9 | 9/9 |
| BlessBoard member OTP browser | 10/10 | 10/10 |

One patient setup run failed before these two passes because the new chart matched an earlier fixture. Unique names fixed it. That run is not a pass.

## Stitch 33

Both historic public screens still exist through `get_screen` and are absent from the earlier `list_screens` title result. The current no-match refusal stays. The masked preview was not implemented. See `docs/qa/V2134_G333_STITCH33_RECONCILIATION.md`.

## Flags

STAFF_OTP_BROWSER_IMPLEMENTED=YES  
STAFF_OTP_BROWSER_PASS=YES  
PATIENT_OTP_BROWSER_IMPLEMENTED=YES  
PATIENT_OTP_BROWSER_PASS=YES  
SESSION_WITHHELD_BEFORE_OTP=YES  
REPLAY_DENIED=YES  
CROSS_CLINIC_DENIED=YES  
MISSING_PROVIDER_FAIL_CLOSED=YES  
MOBILE_CMS_VERIFIED=YES  
TABLET_CMS_VERIFIED=YES  
DESKTOP_CMS_VERIFIED=YES  
STITCH33_STATUS=PRESENT_VIA_GET_SCREEN_ABSENT_FROM_LIST_SCREENS  
SAFE_TESTS_RUN_1=693/693  
SAFE_TESTS_RUN_2=693/693  
HTTP_TESTS_RUN_1=41/41  
HTTP_TESTS_RUN_2=41/41  
AC_BROWSER_RUN_1=36/36  
AC_BROWSER_RUN_2=36/36  
BB_BROWSER_RUN_1=23/23  
BB_BROWSER_RUN_2=23/23  
OTP_SECURITY=15/15,15/15  
LIVE_PROVIDER=NOT_VERIFIED  
HOSTED_MODIFIED=NO  
HOSTED_DB_WRITES=NO  
MIGRATION_APPLIED=NO  
COMMIT=NO  
PUSH=NO  
MAIN_UNCHANGED=YES  
SOURCE_DEFECTS_OPEN=NONE  
EXTERNAL_BLOCKERS=Migration 048 is not in the repo and is not approved for the host. Live email delivery is not approved. The Stitch 33 masked refusal screen needs a separate design decision before implementation. A push to origin/V13 would deploy onto the current testers.  
NEXT_REQUIRED_ACTION=Leave hosted SHA 9d87d73a7957 in place. Review this local candidate before any commit or push. Approve migration 048 and a live provider separately before hosted OTP. Decide separately whether to build the Stitch 33 masked refusal screen.
