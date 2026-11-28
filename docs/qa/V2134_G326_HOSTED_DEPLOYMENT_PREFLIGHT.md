# V2134 G326 hosted deployment preflight

FINAL=V2134_G326_HOSTED_QA_PREFLIGHT

DEPLOYMENT_PERFORMED=NO. This review did not change Hostinger, did not restart workers, did not open a hosted database, did not take a backup, and did not run a migration.

## Candidate

| Check | Result |
| --- | --- |
| Worktree | `~/Development/getproapp-v13` |
| Branch | `V13` |
| `origin/V13` | `c947d26cb57e1456c843ba45e06130db074f8c16` |
| Local HEAD | the same SHA |
| Newer commits | none |
| `main` | `44eafec486a18aeef2777bbcc9683e43f68ebe0d`, unchanged |
| Product version | BlessBoard 2.13.4 and ActiveClinic 2.13.4 |

Untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md` were left untracked.

The candidate differs from the last previously observed hosted SHA `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a` by tests and QA documents only. That diff contains no SQL file.

## Read-only health

Both product hosts were read during this review. They match each other.

| Field | BlessBoard and ActiveClinic |
| --- | --- |
| HTTP | 200, `ok=true` |
| gitSha | `c947d26cb57e` |
| Full SHA for that prefix | `c947d26cb57e1456c843ba45e06130db074f8c16` |
| environment | `testing` |
| deploymentCode | `moovex-platform-testing` |
| mode | `moovex-platform-runtime` |
| platformLine | `v8` |
| expectedIdentityKey | `moovex-platform-v7` |
| expectedDatabaseEnvironment | `testing` |
| sessionCookieName | `moovex_platform_testing_sid` |
| mediaWriteNamespace | `testing` |
| jobsEnabled | false |
| schemaCompatible | true |
| schema code | `ok` |
| missing checks | none |
| branch | `V11` |
| branchSource | `GETPRO_GIT_BRANCH` |
| displayLabel | `V11 testing` |
| About | 2.13.4 |

The G325 preflight observed `e7dbb72bbc11`. This review observed `c947d26cb57e`. The change happened outside this session. It is not a deployment performed by G326.

## Hostinger checkout and branch

`src/platform/runtime/buildIdentity.js` uses the live panel value `GETPRO_GIT_BRANCH` before the git branch. Subdomain workers share the apex app environment and the hbuild metadata file. They do not have a separate Hostinger environment page.

The running build SHA matches the `V13` candidate. The displayed branch is the panel value `V11`. The Hostinger git-branch control itself was not opened. Do not treat the health label as proof of the panel’s git checkout setting, and do not change that setting in this review.

The correction prepared for a later approval is `GETPRO_GIT_BRANCH=V13` on the testing apex app only, together with a testing-worker restart. A restart is required before `/healthz` can show the new label. This review did not set it and did not restart anything.

Stop if a later operator finds `deploymentCode=moovex-platform-production` or `environment=production`.

## Database

Public health does not include the database name, the role, or the connection owner. Those were not read. The operator must read `platform.database_identity` in the testing console before any backup and must stop unless the identity is the testing identity `moovex-platform-v7` with environment `testing`.

Do not connect from a laptop to port `5432`. Do not print a connection string.

## Schema

`schemaCompatible=true` covers the required V7 checks reported by `/healthz`. It does not authorize a new migration.

| Item | Decision |
| --- | --- |
| Candidate versus `e7dbb72b` | Tests and documents only. No migration. |
| Platform migrations in source | through `047_approval_request_foundation.sql` |
| ActiveClinic migrations in source | through `044_laboratory_reference_rules.sql` |
| `db/migrations/platform/048_otp_challenges.sql` | absent. Do not create it. Do not execute it. |
| Community Benefits | `docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql` is marked not applied. It is not a migration. The persistence helper refuses to create the tables. |
| Community tables on the host | not queried |
| Needed for the 64 scenarios | no |

`financialPostingEnabled()` returns false in source. Community Benefits stays off unless a non-production process sets `GETPRO_AC_COMMUNITY_BENEFITS_ENABLED=1`. Do not set that flag for this QA deploy. Do not post a payment.

## Environment presence

Hosted variable values are not visible on `/healthz` and were not read from the panel. This session’s shell did not have `DATABASE_URL`, `GETPRO_DATABASE_URL`, `GETPRO_GIT_BRANCH`, `RESEND_API_KEY`, `GETPRO_RESEND_VERIFIED_DOMAINS`, `GETPRO_RESEND_SENDER_PROFILE`, `GETPRO_RESEND_QA_RECIPIENTS`, `GETPRO_OTP_PEPPER`, `GETPRO_OTP_QA_LIVE_DELIVERY`, `GETPRO_OTP_ACTIVATION`, `GETPRO_OTP_ALLOW_FIXED_CODE`, or `BLESSBOARD_OTP_EXPOSE_TEST_CODE`. That local absence is not a hosted-panel result.

The operator’s later presence check lists names only. Do not copy values into git.

Required for the running testing app, already implied by a healthy process: a database URL and `SESSION_SECRET`. The panel branch variable is present because `branchSource` is `GETPRO_GIT_BRANCH`.

Leave unset or inactive: production OTP activation, a fixed OTP code, exposed test codes, live OTP delivery, `RESEND_API_KEY` until a separate mailbox proof exists, `BLESSBOARD_MEDIA_UPLOADS_ENABLED`, public booking, SMS delivery, and Community Benefits financial posting.

`deliveryActivated` remains false on every OTP channel adapter in source.

## Workers

The documented testing start command is `node index.js` under the Hostinger testing app. `jobsEnabled` is false. Pushing `V13` does not deploy by itself.

A later approved restart touches only the testing workers. It does not restart a production app. This review did not restart any worker.

## Local evidence being carried forward

G324 mapped all 64 historical rows: 48 PASS and 16 FAIL. G325 executed the ten missing local rows. Local result: 60 approved passes, RT-03 and RT-08 policy-disabled, RT-07 provider-blocked, RT-31 a verified chart-first refusal. Disposable suites after the final G325 spec: contract 682/682 twice, HTTP 41/41 twice, ActiveClinic browser 36/36 twice, BlessBoard browser 23/23 twice, ActiveClinic email OTP 9/9 twice, BlessBoard member OTP 10/10 twice. None of those are hosted acceptance.

## Decision

QA_DEPLOYMENT_GO_NO_GO=NO-GO.

The candidate is already the observed running SHA, and it needs no hosted migration. A new deploy from this document is still not approved. The backup is not evidenced, the database name was not read, the branch label is still `V11`, the 64 hosted cases were not executed, and live email OTP is not verified.
