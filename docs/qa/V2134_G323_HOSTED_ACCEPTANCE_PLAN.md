# V2134 G323 hosted acceptance plan

HOSTED_DEPLOYMENT=NOT_PERFORMED.

This document is a checklist for a later, separately approved deployment. It does not authorize that deployment. Hostinger configuration was not changed. Workers were not restarted. Hosted migrations were not run. No hosted backup was taken.

## Read-only observation at review time

Both `https://blessboard.pronline.org/healthz` and `https://activeclinic.pronline.org/healthz` returned 200.

| Field | Observed |
| --- | --- |
| ok | true |
| gitSha | `f167ae260c32` |
| branch | `V11` |
| branchSource | `GETPRO_GIT_BRANCH` |
| environment | testing |
| deploymentCode | `moovex-platform-testing` |
| schemaCompatible | true |
| productVersion in health JSON | absent |

About pages returned 200. BlessBoard title `About BlessBoard · BlessBoard`, heading `About BlessBoard`, version `2.13.4`. ActiveClinic title `About ActiveClinic`, heading `About ActiveClinic`, version `2.13.4`.

`schemaCompatible: true` is an observation. It is not permission to migrate.

## Branch discrepancy

Source health prefers the panel variable `GETPRO_GIT_BRANCH` over the git branch. The panel value is `V11`. The reviewed source branch is `V13`. The hosted SHA prefix `f167ae260c32` matches the G322 commit `f167ae260c32197e368f1bf484325c18e9465db8`, which is on `V13` in git. The panel still labels that checkout `V11`.

Do not change the Hostinger panel to remove the discrepancy. Record it until a separate deployment approval names both the git SHA and the panel value the operator will leave in place.

## Candidate to pin

The hosted build is the G322 parent. It does not contain the G323 diagnostics counter assertions or the disposable reset-budget isolation.

A future deploy must pin the `V13` commit that introduces this plan, after that commit is the verified `origin/V13` SHA. Do not deploy `f167ae260c32197e368f1bf484325c18e9465db8` as if it were the G323 candidate.

## Before any future deploy

1. Separate written approval naming the exact SHA.
2. Operator-owned backup of the hosted database. This review did not take one.
3. Confirm platform migrations present through `047_approval_request_foundation.sql` and ActiveClinic migrations present through `044_laboratory_reference_rules.sql`.
4. Confirm `db/migrations/platform/048_otp_challenges.sql` is still absent. Do not apply it.
5. Leave public booking disabled, SMS disabled, and Community Benefits financial posting disabled.
6. Leave live email OTP disabled. Resend key, verified sender, one approved QA recipient, and the OTP pepper were absent in this environment. No message was sent.
7. After deploy, read `/healthz` and About again. The git SHA must equal the approved SHA. The `V11` panel value must be recorded again if it is still present.
8. Retest the 16 transcribed scenarios on that deployed build. Testing-mode recovery on a disposable database is not the hosted result.
9. Do not mark the 48 untranscribed scenarios PASS. They stay NOT_RUN until the original report is recovered and each row is executed.

Hosted QA acceptance stays closed until those hosted executions exist.
