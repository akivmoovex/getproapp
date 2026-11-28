# V2134 G330 deployment control checklist

STATUS=PREPARED_NOT_PERFORMED  
PANEL_CHANGED=NO  
PUSH=NO  
RESTART_PERFORMED=NO  

This checklist is for an operator with hPanel access. G330 did not open the panel, did not change a setting, and did not push.

## Current evidence

| Item | Evidence |
| --- | --- |
| Testing application | `moovex-platform-testing` |
| Hosts | `https://blessboard.pronline.org` and `https://activeclinic.pronline.org` |
| Both `/healthz` reads in this review | HTTP 200, `ok=true`, `gitSha=d5c5369d22fd`, `environment=testing`, `deploymentCode=moovex-platform-testing`, `branch=V11`, `branchSource=GETPRO_GIT_BRANCH`, `jobsEnabled=false`, `schemaCompatible=true` |
| Full SHA for that prefix | `d5c5369d22fd825938fe1a9692dadee19bfd4a93` |
| `origin/V13` | the same SHA |
| Displayed branch | Panel value `GETPRO_GIT_BRANCH=V11`. That label does not select the checkout |
| Checkout shape | `/__platform/runtime` reports `cwdEphemeral=true` with reason `hbuilds_versions` |
| Automatic deployment | Behavior-verified in G328: documentation pushes to `origin/V13` became new hbuild checkouts. The panel control was not opened then and was not opened now |
| GitHub Actions | G328 found no deploy workflow, webhook, or deployment object for those commits |
| Backup | G326 and G328: `BACKUP_EVIDENCE=NONE` |

During this review the process start time moved while the SHA stayed `d5c5369d22fd`. One read showed `startedAt=2026-11-28T07:54:48Z`. A later read showed BlessBoard pid `273563` at `2026-11-28T07:55:09.473Z` and ActiveClinic pid `273694` at `2026-11-28T07:55:10.106Z`. These were read-only GETs. A new pid with the same SHA is a respawn of the current checkout. A new `gitSha` would be a deployment. This review did not request a restart.

## Operator steps

Stop the list at the first failed check. Do not continue into a restart, a replacement checkout, or the G329 patch.

### 1. Identify the testing application

Open hPanel and select the Node.js app whose deployment code is `moovex-platform-testing`, serving `blessboard.pronline.org` and `activeclinic.pronline.org` from one checkout under the `pronline.org` website.

Stop if the selected app shows `moovex-platform-production`, `environment=production`, or a production hostname. Production is outside this checklist.

### 2. Verify the hosted SHA

Read both:

- `https://blessboard.pronline.org/healthz`
- `https://activeclinic.pronline.org/healthz`

Require both to show `gitSha=d5c5369d22fd`, `environment=testing`, and `deploymentCode=moovex-platform-testing`. Record the time and both `startedAt` values from `/__platform/runtime`.

The pin target before any G329 deploy is this SHA: `d5c5369d22fd825938fe1a9692dadee19bfd4a93`. It is the last commit on `origin/V13`. It does not contain the G329 patch.

### 3. Identify the automatic deployment setting

On that same testing app, find the control that deploys from Git. G328 inferred Hostinger git deploy tracking branch `V13`. The exact hPanel label was not visible to this review.

Record, without changing it:

- the control’s on-screen name
- whether it is on or off
- the repository and branch it tracks
- whether the screen offers an exact commit, or only a branch
- whether the screen says that changing it deploys, restarts, or replaces the checkout

`GETPRO_GIT_BRANCH` is the health label. Changing it does not pin the SHA. Leave it at `V11` in this step.

### 4. Disable automatic deployment only after owner approval

Approval C is still open. When the owner gives it, turn that one control off for the testing app.

If the screen warns that the change deploys, restarts workers, or replaces the checkout, stop. A restart or a new checkout waits for the backup proof in `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` and for a separate restart approval. Do not dismiss that warning.

### 5. Verify the control without a test commit

Do not push a commit to prove the control.

After the owner disables it:

- `origin/V13` is still `d5c5369d22fd825938fe1a9692dadee19bfd4a93`
- both `/healthz` endpoints still show `gitSha=d5c5369d22fd`
- the recorded control remains off
- no new hbuild was requested

That is the verification. A push to `origin/V13` would be the behavior G328 already showed deploys the branch.

### 6. Pin the intended checkout

The intended pin is the SHA already running. If that SHA is still on both hosts and automatic deployment is off, the pin is complete. Do not deploy another SHA as part of the pin, and do not restart.

If the panel can only track branch `V13` and cannot hold a commit, record that limit and stop. Branch tracking is not a pin while `origin/V13` can still move.

Do not point the app at `origin/V11`. `origin/V11` is `fbe7bea01f4e8d107b519b52b68e42e5b1c55686` and does not contain the running commit.

### 7. Leave the workers running

Do not use Deploy or Restart before the backup safeguards are satisfied. The G329 patch is not part of this pin. Deploying it is a later approval, described in `docs/qa/V2134_G330_CONTROLLED_DEPLOYMENT_RUNBOOK.md`.

## Dependency that stops the checklist

If disabling automatic deployment can be done only by a deploy or a restart, the safe sequence is:

1. Stop.
2. Owner confirms the testing database identity and records a snapshot id, time, and retention outside git.
3. Owner separately approves that restart or replacement.
4. The replacement checkout, if one is required, is `d5c5369d22fd825938fe1a9692dadee19bfd4a93` only.
5. Read both health endpoints before any later patch.

G330 does not approve that restart.
