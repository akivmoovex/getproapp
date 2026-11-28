# V2134 G325 SHA-pinned hosted preflight

DEPLOYMENT=NOT_PERFORMED.

This document prepares a later deployment. It does not authorize one. Hostinger was not changed. Workers were not restarted. No hosted database was opened, dumped, or migrated. No backup was taken by this review.

## Read-only observation

Both `https://blessboard.pronline.org/healthz` and `https://activeclinic.pronline.org/healthz` returned 200 during this review.

| Field | Observed value |
| --- | --- |
| gitSha | `e7dbb72bbc11` |
| Full SHA for that prefix | `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a` |
| environment | testing |
| deploymentCode | `moovex-platform-testing` |
| schemaCompatible | true |
| branch | `V11` |
| branchSource | `GETPRO_GIT_BRANCH` |
| BlessBoard About | 2.13.4 |
| ActiveClinic About | 2.13.4 |

`schemaCompatible: true` is an observation. It is not permission to migrate. The host is the G324 commit. It does not contain the G325 browser coverage.

## Candidate

The candidate is the `origin/V13` commit that contains this file. Confirm it with `git rev-parse origin/V13` before any later approval. Deploy that SHA only. Do not deploy the currently hosted SHA as the G325 candidate.

`main` is not the candidate and was not changed.

## Branch label

Source health prefers the live panel value. The panel is `GETPRO_GIT_BRANCH=V11` while the git branch is `V13`. The correction, inside a separate owner approval that also names the candidate SHA, is:

`GETPRO_GIT_BRANCH=V13`

This review did not change the panel.

## Migrations

No new migration is in the G325 diff. `db/migrations/platform/048_otp_challenges.sql` is absent and stays unapproved. Do not create it. Do not run it on the hosted database.

Platform migrations through `047_approval_request_foundation.sql` and ActiveClinic migrations through `044_laboratory_reference_rules.sql` remain the expected source set. The hosted schema check reported no missing required V7 item. That does not add a migration to this candidate.

## Backup and rollback

Before any future deploy, the operator takes a hosted database backup and records its location outside this repository. This review did not take one.

Rollback is a redeploy of `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a`, which is the SHA on the host now. Leave the panel value unchanged unless the same approval changed it. Do not apply migration 048 during rollback.

## Restrictions that stay in force

- Real Resend delivery was not verified. Local OTP environment keys were absent. No email was sent.
- Public booking stays disabled.
- SMS recovery stays unauthorized.
- Community Benefits financial posting stays disabled.
- Production OTP stays disabled.
- Production media-upload type and size checks stay in place.
- Unmatched portal self-registration stays refused.

## Operator sequence, after a separate approval

1. Record both `/healthz` payloads.
2. Take the hosted backup.
3. Deploy only the confirmed candidate SHA.
4. Set `GETPRO_GIT_BRANCH=V13` in that same approval.
5. Read both `/healthz` payloads again and confirm the candidate SHA and branch `V13`.
6. Run `docs/qa/V2134_G324_HOSTED_RETEST_RUNBOOK.md` against that SHA.
7. Do not mark a row accepted from the disposable local runs.
