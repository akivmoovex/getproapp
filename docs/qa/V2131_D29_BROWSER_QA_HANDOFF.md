# V2.13.1 D29 — browser QA handoff

This commit is a QA candidate. It is not a production release.

Safe contract and unit tests passed 447 and failed 0. HTTP regressions and Playwright were not run. The isolated database and the shared PostgreSQL cluster were not changed. BlessBoard and ActiveClinic stay on version `2.13.1`.

Tomorrow, run the gated HTTP and Playwright suites only against `127.0.0.1:55432`. A `NOT_RUN` result is not a pass. Do not enable public booking or coupons. Leave `v13-d25-reuse-clinic` in place. A BlessBoard public-page fixture write still needs its own authorization and must include the church id.

Media uploads stay fail-closed until the deployment sets `BLESSBOARD_MEDIA_UPLOADS_ENABLED`. That flag was not turned on here.

```
FINAL=V2131_D29_BROWSER_QA_PUSH
BRANCH=V13
PREVIOUS_SHA=90d63f600134efa3f74709520a51aea7e17dae81
NEW_SHA=
REMOTE_SHA=
BB_VERSION=2.13.1
AC_VERSION=2.13.1
BROWSER_ISSUES_REVIEWED=9
SOURCE_FIXES_IMPLEMENTED=12
SAFE_TESTS_PASSED=447
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
SHARED_POSTGRES_TOUCHED=NO
UNEXPECTED_FILES=
FILES_COMMITTED=
COMMIT=
PUSH=
REMOTE_SHA_MATCH=
MAIN_UNCHANGED=YES
DEPLOYMENT=NOT_PERFORMED
QA_CANDIDATE_READY=YES
RELEASE_READY=NO
REPORT_PATH=docs/qa/V2131_D29_BROWSER_QA_HANDOFF.md
BLOCKERS=HTTP and browser suites remain NOT_RUN; media upload flag stays off; BlessBoard public-page rows were not inserted
```
