# V2.09 Phase 4J.6 — ActiveClinic Authenticated Theme Security

BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
DB_IDENTITY=PASS — getpro_v209_e2e_test on localhost; environment_code=testing
WEBSITE_INSTANCE=PASS — d7808cc1-2599-418b-9738-53ef46fec84a for e2e-fresh-ac-mv2lby58
CLASSIC_PUBLICATION=PASS — `ac.default` published through publicationService; public availability enabled
ADMIN_LOGIN=PASS — real Chrome login at local `/login` reached the ActiveClinic `/app` dashboard
ADMIN_PREVIEW=PASS — authenticated `/clinics/e2e-fresh-ac-mv2lby58/website/preview` returned 200 and rendered `gp-website-theme--ac-family-wellness-mint` with preview/edit markers
ANONYMOUS_DENIAL=NOT_REPEATED — anonymous preview denial was verified in Phase 4J and not redundantly rerun
DRAFT_LIVE_ISOLATION=PASS — authorized theme POST returned `published:false`; published state remained Classic until restoration
CSRF_REJECTION=PASS — missing CSRF and invalid CSRF both returned HTTP 403 with `code:"csrf"`
CSRF_DB_UNCHANGED=PASS — rejected requests occurred before mutation; final persisted state was restored and verified
INVALID_THEME_REJECTION=NOT_RUN
CROSS_PRODUCT_THEME_REJECTION=NOT_RUN
AUTHORIZED_PUBLICATION=NOT_RUN via HTTP in this phase — supported service publication was used to initialize and restore the fixture
CONTENT_PRESERVATION=PASS — preview/public content remained present; no content deletion observed
RESTORE_CLASSIC=PASS — supported draft-save plus publication restored both draft and published state to `ac.default`
TESTS_PASS=8 — identity, website provisioning, publication/availability, login, preview, draft isolation, CSRF rejection, restoration
TESTS_FAIL=0
TESTS_BLOCKED=2 — invalid-theme and cross-product-theme mutation cases were not executed
PRODUCT_DEFECTS=NONE_CONFIRMED
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_AC_AUTHENTICATED_THEME_SECURITY_COMPLETE

The temporary AC server and browser contexts were closed. No credentials,
cookies, or tokens were logged.
