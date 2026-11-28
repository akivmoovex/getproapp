# V2134 G327 approval decisions

These are four separate decisions. None is approved. Approving one does not approve the others. This document is the request, not the approval.

QA_DEPLOYMENT_GO_NO_GO=NO-GO.  
WRITE_QA_AUTHORIZED=NO.  
REAL_EMAIL_SENT=NO.  
HOSTED_CONFIG_CHANGED=NO.  
HOSTED_DEPLOYMENT=NOT_PERFORMED.

The running SHA when this request was written was `5550bc0eabf7aa66bc9335555fc7d4e57eb72416`. It is a documentation descendant of `c947d26cb57e1456c843ba45e06130db074f8c16`. Do not redeploy the older SHA. A push to `origin/V13` is inferred to deploy by itself. Do not push application code under one of these approvals unless that approval names the SHA.

## A. Backup creation and restore verification

Decision: NOT APPROVED.

Ask: the owner may take one backup of the testing database only, record the snapshot id, retention, and encryption outside git, and restore that snapshot into an empty testing-side target to prove it can be read. Do not restore over the live database. Do not restore a production project. Do not dump through a laptop connection to port `5432`.

Why it is separate: no snapshot id exists in the repository. `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` is not evidence that a backup exists. The V2.12 restore was a local disposable database.

Stop unless `platform.database_identity` is still `moovex-platform-v7` / `testing`. The identity read for this review is in the restricted operator file, not in this request.

## B. Hosted database-writing QA with synthetic fixtures

Decision: NOT APPROVED.

Ask: after A is recorded, the owner may authorize one disposable hosted chart for the unexecuted rows in `docs/qa/V2134_G327_READ_ONLY_ACCEPTANCE.md`. That run may register one synthetic clinic or use an issued testing clinic, create one synthetic patient, and walk the clinical rows. It may not use a real patient. It may not post a payment. It may not enable Community Benefits. It may not send live email or SMS.

Why it is separate: RT-01 and RT-02 passed as anonymous reads. RT-03 failed because two public clinic book URLs showed the booking wizard. Sixty-one rows were not run. A write pass is a different risk from those reads. The hosted ledger is also behind source: ActiveClinic `043` and `044`, and BlessBoard `123` through `130`, are not applied. This request does not authorize applying them.

## C. Hostinger branch metadata correction and restart

Decision: NOT APPROVED.

Ask: the owner may set `GETPRO_GIT_BRANCH=V13` on the testing apex app only, then restart only the testing workers with `node index.js`. Do not point the git checkout at `origin/V11`. Do not restart a production app.

Why it is separate: the `V11` label is the panel variable, and it survived the checkouts that moved the SHA to `V13`. A restart without changing the variable reloads `V11`. A deploy of the connected branch replaces the hbuild directory. Because that deploy appears to follow `origin/V13` already, this approval is a label correction, not a license to deploy a new release or to change the database.

Do this only after A. If either host then shows a different SHA, `environment=production`, or `deploymentCode` other than `moovex-platform-testing`, stop and use the G326 rollback plan. The last SHA this review confirmed healthy is `5550bc0eabf7aa66bc9335555fc7d4e57eb72416`.

## D. Real Resend email testing

Decision: NOT APPROVED.

Ask: the owner may later send one OTP or reset message through Resend to the single approved QA mailbox, on the testing identity only, and record that the message arrived. Production OTP stays inactive. `deliveryActivated` stays false until that separate proof exists. A fixed OTP code stays unset. SMS stays unauthorized.

Why it is separate: RT-07 was not run. This session sent no email. DNS records are not dashboard verification. A successful mailbox test does not approve A, B, or C.
