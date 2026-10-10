# V2.09 Phase 4J.4 — Fresh Registration Authentication

BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
DATABASE_IDENTITY=PASS — getpro_v209_e2e_test on localhost; public/platform environment_code=testing
BB_REGISTRATION=PASS — fresh registration application provisioned organization `26846939-790f-4582-93ff-f9efcce46f0d`, key `e2e-fresh-bb-mv2lby58`, administrator user `3772f636-010d-47b5-8213-2bf633e8c501`
BB_PLATFORM_IDENTITY=BLOCKED — the supported registered-church workflow created a `blessboard.users` administrator and did not create/link a `platform.identities` principal. The inspected `blessboard.user_roles` query also found no role row for that user. This is insufficient for the V5 platform-profile login and cannot be treated as authenticated V5 authorization.
BB_ORGANIZATION_MEMBERSHIP=BLOCKED — no verified V5 platform product/membership linkage was established
BB_WEBSITE_PERMISSION=BLOCKED — not claimed without a V5 principal and effective permission result
BB_BROWSER_LOGIN=BLOCKED
BB_SESSION_REUSE=NOT_RUN
AC_REGISTRATION=PASS — fresh clinic provisioned organization `fbbffc3a-0090-4fa5-a0c8-46de7c03ce44`, slug `e2e-fresh-ac-mv2lby58`, platform identity `d0350cea-20bb-4cd7-bf30-ecfee3422823`
AC_PLATFORM_IDENTITY=PASS — registration returned a platform identity and credential path
AC_STAFF_FACILITY_ACCESS=PARTIAL/PASS — one active staff member was provisioned for the new clinic; effective website-role permission was not yet verified
AC_WEBSITE_PERMISSION=NOT_VERIFIED
AC_BROWSER_LOGIN=NOT_RUN — stopped after the BB V5 principal contract failed; no browser result was fabricated
AC_SESSION_REUSE=NOT_RUN
CROSS_PRODUCT_SESSION_ISOLATION=NOT_RUN
NEW_BB_WEBSITE=NOT_CREATED
NEW_AC_WEBSITE=NOT_CREATED
TESTS_PASS=3 — database identity, BB registration transaction, AC registration transaction
TESTS_FAIL=0
TESTS_BLOCKED=8
BLOCKERS=The registered BlessBoard workflow is legacy-user based and does not establish the platform identity/product-membership/role contract required by the V5 profile. The AC workflow successfully creates a platform identity and staff record, but the requested website permission and browser flow require a subsequent supported website-role/setup sequence. No partial grants or fabricated sessions were added.
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_FRESH_REGISTRATION_AUTH_COMPLETE

The two newly created organizations are disposable E2E records in the approved
database and were preserved for follow-up. No previous fixture organization was
modified; passwords, cookies, and tokens were not logged.
