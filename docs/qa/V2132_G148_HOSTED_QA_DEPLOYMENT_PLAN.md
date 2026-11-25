# V2.13.2 G148 — hosted QA deployment plan

Do not execute this plan from the repository session. No migration, restart, or deploy was performed while writing it.

## 1. Environment inventory

| Item | Testing hosts | Production |
| --- | --- | --- |
| URLs | `https://blessboard.pronline.org`, `https://activeclinic.pronline.org` | Not these hostnames. Production code is `moovex-platform-production` |
| Observed deployment code | `moovex-platform-testing` | Must not be the restart target |
| Observed environment | `testing` | Stop if `/healthz` says `production` |
| Reported database identity | `moovex-platform-v7` / `testing` | A testing hostname is not proof of a separate database |
| Session cookie | `moovex_platform_testing_sid` | Do not reuse a production cookie name |
| Media namespace | `testing` | Do not point it at a production bucket |
| Jobs | `jobsEnabled=false` | Leave jobs off |
| Start command | `node index.js` | Same binary, different env |
| CI | Push to `V13` does not deploy. `ci.yml` ignores `V13`. V13 database jobs stay `if: false` | Untouched |

Apex domains reported on the testing health payload include `pronline.org` and the product subdomains. Confirm in the host panel that this worker is the testing app before any restart.

## 2. SHAs

| Point | SHA |
| --- | --- |
| Preflight `origin/V13` | `155ada725926d83468fe47e82b87757d20adb097` |
| Public `/healthz` this session | `155ada725926` on both product hosts |
| Intended deploy candidate | The `origin/V13` SHA after the G149 push. Fetch it again. Do not deploy `155ada72` if `origin/V13` has moved |

This session did not cause the health SHA to change.

## 3. Compatibility checks

Before authorization, the operator records:

- `/healthz` `deploymentCode=moovex-platform-testing`
- `/healthz` `environment=testing`
- `/healthz` `expectedDatabaseEnvironment=testing`
- A hosting-panel or database-console read of `platform.database_identity` showing the testing identity and the testing database name. This session did not do that read.
- `schemaCompatible=true` is necessary and not sufficient. It does not prove migrations `043`, `044`, or an OTP table.

Do not apply migration `048`. Do not create `platform.otp_challenges`.

## 4. Backup

Take a hosting-panel backup of the testing database and store the backup id. Do not run that backup from a laptop against port `5432`. Do not restore it onto a production database.

## 5. Isolation

Stop the procedure if any of these are true:

- `deploymentCode` is `moovex-platform-production`
- `environment` is `production`
- The database identity row is not the testing identity
- The panel app is the production Node app
- The command would restart a worker other than the testing app

## 6. Change impact

The V13 commits since `a8e6e688` add Resend sender routing, QA documents, and a fixture-phone fix. They do not add a migration. Production OTP, public booking, production media upload, and community-benefits financial posting stay off. No community-benefits posting flag exists in `src/`. Do not add one during deploy.

Resend remains fail-closed. `pronline.org` and `notify.pronline.org` are different domains. Do not set `GETPRO_RESEND_VERIFIED_DOMAINS` until Resend shows that exact domain verified.

## 7. Deployment procedure

1. `git fetch origin V13`
2. `git rev-parse origin/V13` and record it as `<TARGET_SHA>`.
3. Confirm `<TARGET_SHA>` is on `origin/V13` and not on a request to change `main`.
4. Complete sections 4 and 5.
5. In the testing app only, check out `<TARGET_SHA>`.
6. Leave these unset or false: production OTP provider, `BLESSBOARD_MEDIA_UPLOADS_ENABLED`, public booking, `RESEND_API_KEY`.
7. Set `GETPRO_GIT_BRANCH=V13` on the testing apex app so the label matches the git branch. Restart is required before `/healthz` can show it.
8. Restart only the testing workers with the host's normal command (`node index.js` under the panel).
9. Do not restart the production app.

## 8. Verification

```
curl -fsS https://blessboard.pronline.org/healthz
curl -fsS https://activeclinic.pronline.org/healthz
```

Both must show `ok=true`, `deploymentCode=moovex-platform-testing`, `environment=testing`, `schemaCompatible=true`, and `gitSha` equal to the first 12 characters of `<TARGET_SHA>`. After the branch env restart, `branch` should be `V13` and `branchSource` should stay `GETPRO_GIT_BRANCH`. Open both `/about` pages and confirm version `2.13.2`.

Then execute `docs/qa/V2132_G149_HOSTED_BROWSER_QA_CHECKLIST.md` against that SHA. A row can be PASS only after that execution.

## 9. Rollback

Record the pre-deploy `gitSha` (`155ada725926` at this preflight). To roll back, check out that SHA in the testing app, set `GETPRO_GIT_BRANCH` back to the previous panel value if it was changed, and restart the testing workers only. Re-check `/healthz`. Do not restore a production database. There is no new migration to roll back.

Forward repair, if the new SHA fails health, is the same checkout of the last healthy SHA. Do not apply a repair migration.

## 10. QA entry criteria

Hosted browser QA starts only when:

- The isolation checks passed.
- Both health payloads show `<TARGET_SHA>`.
- About pages show `2.13.2`.
- Production OTP, public booking, and production uploads are still off.
- Testers have existing testing identities supplied outside git. This plan does not create accounts.

`HOSTED_QA_DEPLOYMENT_READY=BLOCKED` until an operator completes sections 4, 5, and the independent database-identity read. The application SHA already visible on the hosts is not that authorization.

## Resend operator steps

Still not done, and not part of the application deploy:

1. In Resend, read `pronline.org` and `notify.pronline.org` separately.
2. Copy a domain into `GETPRO_RESEND_VERIFIED_DOMAINS` only after Resend marks that exact name verified.
3. Create a sending-only API key in Resend. Store it as `RESEND_API_KEY` on the testing host. Do not commit it.
4. For the proposed QA senders, set `GETPRO_RESEND_SENDER_PROFILE=hosted-qa` only when the verified list contains `pronline.org`. The proposals are `qa-blessboard@pronline.org` and `qa-activeclinic@pronline.org`. They are not mailboxes yet. Production senders stay `security@notify.blessboard.com`, `security@notify.activeclinic.org`, and `security@notify.pronline.org`.
5. A delivery smoke test needs a separate approval. Do not send one during deploy. Production OTP stays disabled even if mail is later approved.
