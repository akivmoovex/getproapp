# V2.13.2 G145 — Hosted QA deployment plan

This session performed a read-only preflight. It did not deploy, restart a service, change DNS, apply a migration, connect to a hosted database, or send email.

## Observed public state

Fetched during this preflight from the public sites:

| Host | About version | `/healthz` gitSha | `/healthz` branch label | deploymentCode | schemaCompatible |
| --- | --- | --- | --- | --- | --- |
| `https://blessboard.pronline.org` | 2.13.2 | `a8e6e688b084` | `V11` from `GETPRO_GIT_BRANCH` | `moovex-platform-testing` | true |
| `https://activeclinic.pronline.org` | 2.13.2 | `a8e6e688b084` | `V11` from `GETPRO_GIT_BRANCH` | `moovex-platform-testing` | true |

Both health responses also reported `environment=testing`, `expectedIdentityKey=moovex-platform-v7`, `expectedDatabaseEnvironment=testing`, `sessionCookieName=moovex_platform_testing_sid`, `mediaWriteNamespace=testing`, and `jobsEnabled=false`.

`schemaCompatible=true` covers the published V7 required checks only: website tables, registration lifecycle, website RBAC, provision-stage columns, terms columns, ActiveClinic core tables, `website_published`, and `public_website_visible`. It does not prove `platform.otp_challenges`, ActiveClinic migrations `043` and `044`, or a Resend configuration.

The observed SHA is the G141 handoff. This cycle adds a later commit. The hosted process was not updated by this session.

`HOSTED_QA_DEPLOYMENT_READINESS=BLOCKED`.

## Why it is blocked

- Resend verification is `DOMAIN_VERIFICATION_NOT_OBSERVED`. No API key was confirmed on the host.
- `GETPRO_GIT_BRANCH` still labels the process `V11` while the candidate git branch is `V13`.
- Production OTP must stay disabled. Migration `048` is not in the tree and must not be applied.
- Migrations `043` and `044` are applied only on disposable `getpro_v13_e2e_g78d2301`. The health check does not show them, and they must not be assumed on the hosted database.
- Hosted QA identities for the November 23 sheet were not provisioned here.
- D25 slot capacity is still unapproved. Public booking and production media upload stay off.

## Operator checklist

Run this only after a separate written authorization. Replace `<TARGET_SHA>` with the `origin/V13` SHA from `docs/qa/V2132_G146_QA_DAY_HANDOFF.md` after that push. Do not deploy `a8e6e688` once a later reviewed SHA exists.

1. Backup. Take a hosted database backup through the hosting panel and record the backup id. Do not run that backup against port `5432` from a laptop.
2. Isolation. Confirm the target host is `moovex-platform-testing` and the database identity is the testing identity already reported by `/healthz`. Stop if the identity is production.
3. Source. On the host, fetch `V13` and check out `<TARGET_SHA>`. Do not check out `main`.
4. Schema. Do not apply a new migration for this candidate. Confirm `/healthz` still reports `schemaCompatible=true` after restart. Do not apply `043`, `044`, or an OTP migration.
5. Configuration. Keep these unset or false: production OTP provider, `BLESSBOARD_MEDIA_UPLOADS_ENABLED`, and public booking. Leave `RESEND_API_KEY` unset until Resend verification is separately confirmed. If a later approval sets hosted QA mail, use `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` and `GETPRO_RESEND_VERIFIED_DOMAINS=pronline.org` only after Resend shows that exact domain verified. Do not put `notify.pronline.org` in that list unless Resend verified that different name.
6. Branch label. Set `GETPRO_GIT_BRANCH` only if the operator wants the health label to say `V13`. The About version stays `2.13.2` from the build.
7. Restart the testing workers with the host's normal restart command. Do not restart a production worker.
8. Health. `curl -fsS https://blessboard.pronline.org/healthz` and `curl -fsS https://activeclinic.pronline.org/healthz`. Both must show `ok=true`, `schemaCompatible=true`, `deploymentCode=moovex-platform-testing`, and `gitSha` equal to the first 12 characters of `<TARGET_SHA>`.
9. Smoke. Open both `/about` pages and confirm version `2.13.2`. Sign in with an existing testing identity supplied outside git. Walk one synthetic patient, one website publish, and one BlessBoard member page from `V2132_G143_QA_EXECUTION_GUIDE.md`. Do not send email. Do not enable booking or uploads.
10. Rollback. Check out the previous SHA recorded from the pre-deploy `/healthz` (`a8e6e688b084` at this preflight) and restart the testing workers. Re-check `/healthz`. Do not roll back by restoring a production database.

## Flags that stay off after a future deploy

| Flag | Required state |
| --- | --- |
| Production OTP | Disabled. No `platform.otp_challenges` migration |
| Public booking | Disabled |
| `BLESSBOARD_MEDIA_UPLOADS_ENABLED` | Unset |
| Resend live send | Off until the exact domain is verified and a sending-only key is stored on the host |
| Jobs | Leave `jobsEnabled` as the testing profile already has it |
