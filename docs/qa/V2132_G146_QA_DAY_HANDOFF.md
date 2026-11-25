# V2.13.2 G146 — QA-day handoff

Implementation commit `2b9cee22556a233257cbf542218e87ad640d4822` on branch `V13`. This file does not record its own commit. Base `a8e6e688b0840d063a38d031eb79f6599636cc01`. BlessBoard and ActiveClinic stay `2.13.2`. QA is NO-GO. The release is not ready. This session did not deploy.

## How QA should test

Use `docs/qa/V2132_G143_QA_EXECUTION_GUIDE.md` for the steps and `docs/qa/V2132_G143_QA_ACCEPTANCE_MATRIX.md` for the 15 ActiveClinic ids. Local disposable evidence is the verification record. Hosted execution waits for a separate authorization in `docs/qa/V2132_G145_HOSTED_QA_DEPLOYMENT_PLAN.md`.

Do not write passwords, API keys, or OTP codes into the result sheet.

## Resend

| Item | Result |
| --- | --- |
| Reported domain | `pronline.org`. Not re-observed in Resend |
| Catalog domain | `notify.pronline.org`. Not interchangeable with `pronline.org` |
| Verification | `DOMAIN_VERIFICATION_NOT_OBSERVED` |
| API key | Unset in this process. Not stored in git |
| Real email | Not sent |
| Adapter | Implemented. Hosted-QA senders stay fail-closed until the exact domain is listed |

## Local results

Each pair is two separate runs.

| Suite | Result |
| --- | --- |
| Database-free | 571 executed, 569 passed, 0 failed, 2 skipped, both runs |
| HTTP | 35 executed, 32 passed, 3 failed, both runs |
| Playwright | 49 passed, 0 failed, both runs. ActiveClinic 26 and BlessBoard 23 |

D14C and D16 platform OTP failed because `platform.otp_challenges` is absent. D25 slot remains `BLOCKED_APPROVAL_REQUIRED`. D25 overlap passed on both HTTP runs, including the two-client test.

One earlier HTTP run failed D16 ActiveClinic auth because the fixture reused a 3-digit phone tail. That path was repaired before the two official HTTP runs.

## Hosted preflight

Public About pages showed version `2.13.2`. Public `/healthz` on both pronline hosts showed git SHA `a8e6e688b084`, branch label `V11`, deployment `moovex-platform-testing`, and `schemaCompatible=true` for the V7 required checks. That SHA is the previous handoff, not this commit. No hosted database was opened. No service was restarted.

`HOSTED_QA_DEPLOYMENT_READINESS=BLOCKED`.

## Known open items

1. Production OTP is disabled.
2. Patient OTP recovery is not release-ready.
3. D25 slot-capacity policy remains unapproved.
4. Public self-registration is not an approved feature.
5. Public appointment booking remains disabled.
6. Production binary media upload remains disabled.
7. Hosting may still have an older commit until separately deployed.
8. Resend domain setup does not prove OTP delivery.

Next action: QA can execute the local guide. A hosted run needs a separate approval, a backup, checkout of the pushed `V13` SHA, and no new migration. Resend mail stays off until Resend shows the exact domain verified.
