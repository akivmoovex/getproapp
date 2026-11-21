# V2.13.1 D14 — BlessBoard member registration fixes

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. D04–D13 files were left in place. No database, role, migration, browser, member insert, or production OTP was used.

Safe contract and unit tests: 417 passed, 0 failed. The D04 HTTP and Playwright suites were not executed. Neither fix is verified by an authorized regression pass.

## BB-MEM-01

`/hq/members/new` collects full name, phone, and an authorized branch, plus an optional email. The parser still required a residential address, marital status, and emergency contact, so a post of only the supported fields returned the form instead of “Review new member”.

Omitted address, marital status, and emergency-contact values are now optional. A supplied invalid marital status, a partial emergency contact, or an invalid emergency phone is still rejected. Name, phone, and branch stay required. Email is validated only when it is present. The create route still accepts a branch only when it is an active branch of this church, and creation still requires `members.create`.

The form labels the visible fields, marks name, phone, and branch required, and shows field errors beside those inputs and in the error summary. The hidden last-name label was removed. Review, the created page, and the member directory all show name, phone, optional email, branch, and `not_activated`.

## BB-MEM-02

The HQ shell issues one signed CSRF token per render and writes that same value into the cookie, the logout forms, and the member form. A caller-supplied `csrfToken` cannot replace it. A missing or mismatched token still returns 403 with “Invalid or missing CSRF token.” The members routes do not call the token issuer themselves and do not bypass CSRF checks. The add-member GET handler calls the shell once. A later render issues a new pair; the previous form token does not match the new cookie. The route remains behind the authenticated HQ session before the token is checked.

## Still blocked

Authorized HTTP and browser runs are not done. No member was created, and the disposable database and least-privilege role from D12 were not created.

FINAL=V2131_D14
BUGS_TARGETED=2
FIXED_IN_SOURCE=BB-MEM-01, BB-MEM-02
PARTIAL=
BLOCKED=
SAFE_TESTS_PASSED=417
SAFE_TESTS_FAILED=0
HTTP_TESTS=NOT_RUN
BROWSER_TESTS=NOT_RUN
DATABASE_MUTATION=NO
COMMIT=NOT_PERFORMED
PUSH=NOT_PERFORMED
BLOCKERS=Authorized HTTP and browser regression was not run. No database-backed member creation was executed.
