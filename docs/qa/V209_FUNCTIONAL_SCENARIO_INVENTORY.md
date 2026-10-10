# V2.09 Authoritative Functional Scenario Inventory

Reconstructed from the available V209 registration matrix and repository evidence. Requested V208 artifacts were not present.

TOTAL_FUNCTIONAL_SCENARIOS=35
FULL=19
PARTIAL=13
NONE=0
ENVIRONMENT_BLOCKED=0
BROWSER_BLOCKED=3
RUNNABLE_FUNCTIONAL_SCENARIOS=32
FUNCTIONAL_SCENARIO_COVERAGE_PERCENT=59.38
COVERAGE_WITH_PARTIAL_PERCENT=100.00

| ID | Product | Area | Risk | Status | Name | Evidence |
|---|---|---|---|---|---|---|
| V209-01 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Below-minimum password rejected | tests/v209-registration-regressions.test.js |
| V209-02 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Minimum length boundary satisfied | tests/v209-registration-regressions.test.js |
| V209-03 | SHARED_PLATFORM | PASSWORD_POLICY | MEDIUM | FULL | Uppercase rule transition | tests/v209-registration-regressions.test.js |
| V209-04 | SHARED_PLATFORM | PASSWORD_POLICY | MEDIUM | FULL | Lowercase rule transition | tests/v209-registration-regressions.test.js |
| V209-05 | SHARED_PLATFORM | PASSWORD_POLICY | MEDIUM | FULL | Number rule transition | tests/v209-registration-regressions.test.js |
| V209-06 | SHARED_PLATFORM | PASSWORD_POLICY | MEDIUM | FULL | Special-character rule transition | tests/v209-registration-regressions.test.js |
| V209-07 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Partial password exact unsatisfied requirements | tests/v209-registration-regressions.test.js |
| V209-08 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Fully compliant password accepted | tests/v209-registration-regressions.test.js |
| V209-09 | SHARED_PLATFORM | PASSWORD_POLICY | CRITICAL | FULL | Server validation uses shared policy | tests/v209-registration-regressions.test.js |
| V209-10 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Client metadata matches server policy | tests/v209-registration-regressions.test.js |
| V209-11 | SHARED_PLATFORM | PASSWORD_POLICY | HIGH | FULL | Future policy changes centrally | tests/v209-registration-regressions.test.js |
| V209-12 | BLESSBOARD | PASSWORD_POLICY | HIGH | PARTIAL | Step 2 initially renders unsatisfied indicators | tests/blessboard-platform-01-registration.test.js |
| V209-13 | BLESSBOARD | PASSWORD_POLICY | HIGH | BROWSER_BLOCKED | Password indicators update while typing | tests/blessboard-platform-01-registration.test.js |
| V209-14 | BLESSBOARD | PASSWORD_POLICY | HIGH | BROWSER_BLOCKED | Satisfied indicators expose class and ARIA state | tests/blessboard-platform-01-registration.test.js |
| V209-15 | BLESSBOARD | PASSWORD_POLICY | CRITICAL | PARTIAL | Weak password cannot continue | tests/blessboard-platform-01-registration.test.js |
| V209-16 | BLESSBOARD | PASSWORD_POLICY | CRITICAL | PARTIAL | Valid password continues | tests/blessboard-platform-01-registration.test.js |
| V209-17 | BLESSBOARD | PASSWORD_POLICY | HIGH | FULL | Confirmation mismatch rejected | tests/blessboard-platform-01-registration.test.js |
| V209-18 | BLESSBOARD | PASSWORD_POLICY | CRITICAL | FULL | BB consumes shared policy without duplicate rules | tests/blessboard-platform-01-registration.test.js |
| V209-23 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | PARTIAL | Step 1 to Step 2 succeeds | tests/blessboard-platform-01-registration.test.js |
| V209-24 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | PARTIAL | Validation correction and resubmit succeeds | tests/blessboard-platform-01-registration.test.js |
| V209-25 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | PARTIAL | Back navigation preserves wizard state | tests/blessboard-platform-01-registration.test.js |
| V209-26 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | PARTIAL | Email correction continues | tests/blessboard-platform-01-registration.test.js |
| V209-27 | BLESSBOARD | REGISTRATION_SESSION | HIGH | BROWSER_BLOCKED | Terms return preserves state | tests/blessboard-platform-01-registration.test.js |
| V209-28 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | FULL | Current CSRF token succeeds | tests/blessboard-platform-01-registration.test.js |
| V209-29 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | FULL | Missing CSRF rejected | tests/blessboard-platform-01-registration.test.js |
| V209-30 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | FULL | Invalid CSRF rejected | tests/blessboard-platform-01-registration.test.js |
| V209-32 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | PARTIAL | Validation failure never produces session-expired error | tests/blessboard-platform-01-registration.test.js |
| V209-19 | ACTIVECINIC | REGISTRATION_SESSION | CRITICAL | PARTIAL | Registration remains green | tests/activeclinic-booking-patient-linkage.test.js |
| V209-20 | ACTIVECINIC | PASSWORD_POLICY | CRITICAL | FULL | AC consumes shared policy | tests/v209-registration-regressions.test.js |
| V209-21 | ACTIVECINIC | PASSWORD_POLICY | HIGH | PARTIAL | AC password indicators remain correct | tests/v209-registration-regressions.test.js |
| V209-22 | ACTIVECINIC | REGISTRATION_SESSION | CRITICAL | FULL | No AC regression from policy extraction | tests/activeclinic-booking-patient-linkage.test.js |
| V209-35 | ACTIVECINIC | REGISTRATION_SESSION | CRITICAL | PARTIAL | AC registration/session behavior remains green | tests/activeclinic-booking-patient-linkage.test.js |
| V209-31 | SHARED_PLATFORM | CSRF_SESSION | CRITICAL | FULL | Expired or missing session handled safely | tests/v8-shared-session-security.test.js |
| V209-33 | SHARED_PLATFORM | PRODUCT_ISOLATION | CRITICAL | PARTIAL | Registration state isolated between products | tests/v8-tenant-product-isolation.test.js |
| V209-34 | SHARED_PLATFORM | TENANT_ISOLATION | CRITICAL | PARTIAL | Registration state isolated between tenants/sessions | tests/v8-tenant-product-isolation.test.js |

## Validation

{"uniqueIds":true,"partitionSum":true,"fullHaveEvidence":true}

## PARTIAL_SCENARIOS

- V209-12 | BLESSBOARD | PASSWORD_POLICY | HIGH | Step 2 initially renders unsatisfied indicators | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-15 | BLESSBOARD | PASSWORD_POLICY | CRITICAL | Weak password cannot continue | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-16 | BLESSBOARD | PASSWORD_POLICY | CRITICAL | Valid password continues | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-23 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | Step 1 to Step 2 succeeds | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-24 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | Validation correction and resubmit succeeds | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-25 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | Back navigation preserves wizard state | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-26 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | Email correction continues | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-32 | BLESSBOARD | REGISTRATION_SESSION | CRITICAL | Validation failure never produces session-expired error | WHY_NOT_FULL=Server/static evidence lacks complete browser state transition | EXISTING_TEST=tests/blessboard-platform-01-registration.test.js | MISSING_TEST=Add Playwright coverage | RECOMMENDED_LAYER=Playwright
- V209-19 | ACTIVECINIC | REGISTRATION_SESSION | CRITICAL | Registration remains green | WHY_NOT_FULL=No complete public browser/session journey assertion | EXISTING_TEST=tests/activeclinic-booking-patient-linkage.test.js | MISSING_TEST=Add Playwright/integration coverage | RECOMMENDED_LAYER=Playwright/integration
- V209-21 | ACTIVECINIC | PASSWORD_POLICY | HIGH | AC password indicators remain correct | WHY_NOT_FULL=No complete public browser/session journey assertion | EXISTING_TEST=tests/v209-registration-regressions.test.js | MISSING_TEST=Add unit coverage | RECOMMENDED_LAYER=unit
- V209-35 | ACTIVECINIC | REGISTRATION_SESSION | CRITICAL | AC registration/session behavior remains green | WHY_NOT_FULL=No complete public browser/session journey assertion | EXISTING_TEST=tests/activeclinic-booking-patient-linkage.test.js | MISSING_TEST=Add Playwright/integration coverage | RECOMMENDED_LAYER=Playwright/integration
- V209-33 | SHARED_PLATFORM | PRODUCT_ISOLATION | CRITICAL | Registration state isolated between products | WHY_NOT_FULL=No end-to-end registration-state proof | EXISTING_TEST=tests/v8-tenant-product-isolation.test.js | MISSING_TEST=Add integration coverage | RECOMMENDED_LAYER=integration
- V209-34 | SHARED_PLATFORM | TENANT_ISOLATION | CRITICAL | Registration state isolated between tenants/sessions | WHY_NOT_FULL=No end-to-end registration-state proof | EXISTING_TEST=tests/v8-tenant-product-isolation.test.js | MISSING_TEST=Add integration coverage | RECOMMENDED_LAYER=integration

## BROWSER_BLOCKED_SCENARIOS

- V209-13 | BLESSBOARD | Password indicators update while typing | browser fixture/setup unavailable
- V209-14 | BLESSBOARD | Satisfied indicators expose class and ARIA state | browser fixture/setup unavailable
- V209-27 | BLESSBOARD | Terms return preserves state | browser fixture/setup unavailable

## NONE_SCENARIOS

None in this reconstructed V209 scope.

## STALE_TESTS

- STALE_TEST_1: tests/activeclinic-mf03-registration.test.js — step 2 password policy copy — expects legacy rendered helper text absent from current V9 registration view
- STALE_TEST_2: ActiveClinic representative registration expectation (second failure in prior suite) — prior audit recorded a second stale expectation but persisted no exact test identity; requires rerun with retained TAP output

## Non-blocked completion

V209-22, V209-33, and V209-34 are FULL based on existing meaningful assertions; no duplicate tests were added.
