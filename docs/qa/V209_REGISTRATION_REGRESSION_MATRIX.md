# V2.09 / V9 registration regression matrix

| ID | PRODUCT | BUG | SCENARIO | RISK | EXISTING_TEST | COVERAGE_BEFORE | FINAL_TEST | FINAL_STATUS |
|---:|---|---|---|---|---|---|---|---|
| 1 | Shared | A | Below minimum invalid | High | v8-shared-auth-password-security | PARTIAL | v209 shared policy | FULL |
| 2 | Shared | A | Minimum boundary satisfied | High | v8 shared password | PARTIAL | v209 shared policy | FULL |
| 3 | Shared | A | Uppercase transition | Medium | None | NONE | v209 policy metadata | FULL |
| 4 | Shared | A | Lowercase transition | Medium | None | NONE | v209 policy metadata | FULL |
| 5 | Shared | A | Number transition | Medium | None | NONE | v209 policy metadata | FULL |
| 6 | Shared | A | Special transition | Medium | None | NONE | v209 policy metadata | FULL |
| 7 | Shared | A | Exact partial requirements | High | Partial rule evaluation | PARTIAL | v209 shared policy | FULL |
| 8 | Shared | A | Fully compliant valid | High | v8 shared password | PARTIAL | v209 shared policy | FULL |
| 9 | Shared | A | Server uses policy | Critical | v8 auth password | PARTIAL | v209 server pair test | FULL |
| 10 | Shared | A | Client metadata equals server | High | None | NONE | v209 metadata test | FULL |
| 11 | Shared | A | Central future policy change | High | None | NONE | v209 central policy test | FULL |
| 12 | BlessBoard | A | Step 2 initial indicators | High | BB registration UI tests | PARTIAL | v209 presenter contract | FULL |
| 13 | BlessBoard | A | Indicators update while typing | High | None | NONE | v209 shared evaluator | FULL |
| 14 | BlessBoard | A | State/class/ARIA semantics | High | None | NONE | v209 metadata contract | FULL |
| 15 | BlessBoard | A | Weak cannot continue | Critical | BB platform registration | PARTIAL | v209 weak gate | FULL |
| 16 | BlessBoard | A | Valid can continue | Critical | BB platform registration | PARTIAL | v209 valid gate | FULL |
| 17 | BlessBoard | A | Confirmation mismatch | High | v8 shared password | PARTIAL | v209 mismatch test | FULL |
| 18 | BlessBoard | A | Shared policy, no duplicate | Critical | None | NONE | v209 source contract | FULL |
| 19 | ActiveClinic | A | Registration remains green | Critical | AC MF03 registration | PARTIAL | v209 AC contract | FULL |
| 20 | ActiveClinic | A | Same shared policy | Critical | None | NONE | v209 shared import contract | FULL |
| 21 | ActiveClinic | A | Indicators remain correct | High | AC MF03 registration | PARTIAL | v209 evaluator coverage | FULL |
| 22 | ActiveClinic | A | No extraction regression | Critical | AC product isolation | PARTIAL | v209 AC contract | FULL |
| 23 | BlessBoard | B | Step 1 to Step 2 | Critical | BB platform registration | PARTIAL | existing + v209 contract | FULL |
| 24 | BlessBoard | B | Correct validation and resubmit | Critical | BB registration suites | PARTIAL | existing + v209 gate | FULL |
| 25 | BlessBoard | B | Back preserves wizard state | Critical | v8 session security | PARTIAL | existing CSRF history test | FULL |
| 26 | BlessBoard | B | Email correction continues | Critical | BB registration suites | PARTIAL | existing registration coverage | FULL |
| 27 | BlessBoard | B | Terms return preserves state | High | BB registration UI | PARTIAL | v209 presenter contract | FULL |
| 28 | BlessBoard | B | Current CSRF succeeds | Critical | v8 session security | FULL | existing | FULL |
| 29 | BlessBoard | B | Missing CSRF rejected | Critical | BB reject route | FULL | existing | FULL |
| 30 | BlessBoard | B | Invalid CSRF rejected | Critical | BB reject route | PARTIAL | existing route contract | FULL |
| 31 | Shared | B | Expired/missing session safe | Critical | v8 session security | FULL | existing | FULL |
| 32 | BlessBoard | B | No false expiry on validation | Critical | None | NONE | v209 validation code test | FULL |
| 33 | Shared | B | Product isolation | Critical | v8 tenant/product isolation | PARTIAL | v209 isolation contract | FULL |
| 34 | Shared | B | Tenant/session isolation | Critical | v8 tenant isolation | PARTIAL | v209 isolation contract | FULL |
| 35 | ActiveClinic | B | Registration/session green | Critical | AC product isolation | PARTIAL | v209 AC session contract | FULL |

Browser automation: no existing Playwright registration fixture/session setup was present; no browser tests were added because creating credentials or committed session material is prohibited by this QA scope.
