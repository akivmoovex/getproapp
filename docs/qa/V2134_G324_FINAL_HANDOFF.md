# V2134 G324 final handoff

FINAL=V2134_G324_FULL_QA_RECONCILIATION

ORIGINAL_DOCX_READ=YES.  
RT_CASES_FULLY_MAPPED=64.  
HISTORICAL_PASS=48.  
HISTORICAL_FAIL=16.  
The written report date 28/11/2025 is flagged for owner confirmation. The document’s own status column matches 48 PASS and 16 FAIL. Patient names and record identifiers were left out of the committed reports. The raw DOCX was not committed.

CURRENT_LOCAL_PASS=50.  
CURRENT_LOCAL_FAIL=0.  
CURRENT_NOT_RUN=10 (RT-11, RT-17, RT-18, RT-19, RT-20, RT-21, RT-22, RT-23, RT-24, RT-50).  
POLICY_DISABLED=RT-03, RT-08, Community Benefits posting.  
PROVIDER_BLOCKED=RT-07.  
RT-31 is an approved chart-first refusal. It is not a local pass of self-registration and not an open source defect.  
HOSTED_RETEST_REQUIRED=64.  
NEW_TESTS=1 browser test, G324, plus directory search, four vital signs, the pending radiology Open queue, and a publish-response wait.

SAFE_TESTS=682/682 twice.  
HTTP_TESTS=41/41 twice.  
AC_BROWSER=34/34 twice.  
POSTGRESQL_TESTS=included in the HTTP pair.  
LIVE_EMAIL_OTP=NO.  
HOSTED_DEPLOYMENT=NOT_PERFORMED.  
The host currently reports gitSha `8aa6fda62294` and branch `V11` from `GETPRO_GIT_BRANCH`. About pages are 2.13.4.

P0_OPEN=OTP-LIVE-MAILBOX, OTP-MIGRATION-048, PUBLIC-BOOKING, HOSTED-BRANCH-V11.  
P1_OPEN=CB-POSTING, HOSTED-RETEST, the 10 unexecuted historical passes, RT-31 owner confirmation.

QA_GO_NO_GO=NO-GO.

NEXT_REQUIRED_ACTION=Approve a deployment of the G324 commit, set the panel branch only in that same approval, then run `docs/qa/V2134_G324_HOSTED_RETEST_RUNBOOK.md` on that SHA. Do not declare release acceptance from the disposable runs.

`main` was not changed. Nothing was deployed. No payment was posted and no live email was sent.
