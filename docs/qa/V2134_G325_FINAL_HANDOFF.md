# V2134 G325 final handoff

FINAL=V2134_G325_LOCAL_QA_CLOSURE

RT_TOTAL=64.  
RT_SUPPORTED_ENABLED=60.  
RT_LOCALLY_PASSED=60.  
RT_NOT_RUN=0.  
RT_POLICY_DISABLED=2 (RT-03 public booking, RT-08 SMS). Community Benefits financial posting is also disabled and is not one of the 64 rows.  
RT_PROVIDER_BLOCKED=1 (RT-07 live email OTP).  
RT-31 is an approved chart-first refusal. It is not a local pass of self-registration and not an open defect.  
60 + 2 + 1 + 1 = 64.  
RT_HOSTED_RETEST_REQUIRED=64.

RT11=PASS.  
RT17=PASS.  
RT18=PASS.  
RT19=PASS.  
RT20=PASS.  
RT21=PASS.  
RT22=PASS.  
RT23=PASS.  
RT24=PASS.  
RT50=PASS.

PATIENT_PORTAL=staff-created charts, authorized activation, testing-mode recovery, and duplicate-account protection remain. Unmatched public registration remains refused.  
LABORATORY=local pass, including received versus processing and hub counts.  
RADIOLOGY=local pass, including the pending Open queue.  
CLINICAL_PRINTING=local pass for the existing print regions.

SAFE_RUN_1=682/682.  
SAFE_RUN_2=682/682.  
HTTP_RUN_1=41/41.  
HTTP_RUN_2=41/41.  
AC_BROWSER_RUN_1=36/36.  
AC_BROWSER_RUN_2=36/36.  
BB_BROWSER_RUN_1=23/23.  
BB_BROWSER_RUN_2=23/23.  
OTP_BROWSER=ActiveClinic email OTP 9/9 twice. BlessBoard member OTP 10/10 twice. Neither is mailbox proof.  
COMMUNITY_POSTGRESQL=pass twice inside the HTTP runs. Financial posting stayed disabled.

SOURCE_DEFECTS_OPEN=0.  
EXTERNAL_BLOCKERS=live mailbox OTP, unapproved migration 048, public booking policy, SMS policy, Community Benefits posting policy, hosted branch label V11, hosted retest not performed.

HOSTED_CURRENT_SHA=`e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a`.  
HOSTED_BRANCH=V11 from `GETPRO_GIT_BRANCH`.  
HOSTED_CANDIDATE_SHA=the `origin/V13` commit that contains this file. Confirm with `git rev-parse origin/V13`.  
DEPLOYMENT=NOT_PERFORMED.

The planned panel correction, not applied here, is `GETPRO_GIT_BRANCH=V13` in the same future approval that names the candidate SHA.

QA_GO_NO_GO=NO-GO.  
RELEASE_READY=NO.

NEXT_REQUIRED_OPERATOR_ACTION=Approve a deployment of the confirmed candidate SHA, set the panel branch to V13 only in that approval, take a hosted backup first, then run `docs/qa/V2134_G324_HOSTED_RETEST_RUNBOOK.md` on that SHA. Do not declare hosted acceptance from these disposable runs.

`main` was not changed. Nothing was deployed. No payment was posted and no live email was sent.
