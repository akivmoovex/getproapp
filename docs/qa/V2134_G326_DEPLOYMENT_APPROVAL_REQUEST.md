# V2134 G326 deployment approval request

This is a request for a later owner decision. It is not the approval. G326 did not deploy.

## Ask

Decide whether the testing app may keep running `c947d26cb57e1456c843ba45e06130db074f8c16`, and whether a later change may set `GETPRO_GIT_BRANCH=V13` and restart only the testing workers.

Do not approve a second checkout of the same SHA as if it were a new release. Both product hosts already reported that SHA during this preflight. The displayed branch was still `V11`.

## Why the code change is small

The candidate adds the G325 browser coverage and QA documents on top of `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a`. It adds no migration. Platform migrations stop at 047. ActiveClinic migrations stop at 044. OTP migration 048 is absent. Community Benefits SQL remains an unapplied reviewed file and is not required for the 64 scenarios.

Local disposable results for that SHA are recorded in `docs/qa/V2134_G325_FINAL_TEST_EXECUTION.md`. They are not hosted acceptance.

## What must stay unchanged

- Production OTP stays disabled. `deliveryActivated` stays false.
- Public booking stays disabled.
- SMS stays unauthorized.
- Community Benefits financial posting stays disabled.
- Existing clinic and patient records stay in place. The acceptance sheet uses disposable testing records only.
- `main` stays unchanged.
- No hosted migration runs under this request.

## What is not yet safe to call a GO

- No hosted backup id is recorded.
- The database name and connection owner were not read. The operator must confirm `platform.database_identity` before any backup or restart.
- The 64-case sheet in `docs/qa/V2134_G326_64_CASE_HOSTED_ACCEPTANCE.md` has no executed results.
- Live Resend delivery is not verified. RT-07 stays blocked.
- The panel label is `V11`. Changing it requires a restart that this request does not perform.

## If the owner approves a later restart

1. Read both `/healthz` endpoints and `platform.database_identity`.
2. Take the testing-panel backup and record its id outside git.
3. Set `GETPRO_GIT_BRANCH=V13` on the testing apex app only.
4. Restart only the testing workers with `node index.js`.
5. Confirm both hosts show `gitSha=c947d26cb57e`, `branch=V13`, `branchSource=GETPRO_GIT_BRANCH`, `environment=testing`, `deploymentCode=moovex-platform-testing`, and `schemaCompatible=true`.
6. Confirm both About pages show 2.13.4.
7. Execute the 64-case sheet. Do not mark policy or provider rows as passes.
8. If health fails, follow `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` back to `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a` unless a newer recorded-good SHA was written down before the restart.

## Decision requested

QA_DEPLOYMENT_GO_NO_GO=NO-GO until the owner records the backup and authorizes the branch change separately. The candidate itself does not require a hosted schema change.
