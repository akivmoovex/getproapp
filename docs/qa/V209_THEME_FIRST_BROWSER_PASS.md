# V2.09 Phase 4H.5 — First Browser Pass

BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
E2E_DATABASE=getpro_v209_e2e_test — local PostgreSQL only; public/platform identities verified as testing
FIXTURE_HELPER=Lifecycle services reused directly: provisionPlatformTenant, provisionBlessBoardChurch, repairWebsiteFoundation, submitAndProvisionClinicRegistration, template registration, findWebsiteInstanceByOrgProduct, saveWebsiteThemeDraft, publishWebsiteDraft, setClinicWebsiteAvailability
BB_FIXTURE=PASS — organization 47bf3d1c-65e8-469f-85ed-63b083e015fe; key/host e2e-bb-mv2kt82x; church fixture created through supported services
BB_PUBLISHED_THEME=bb.default; persisted draft and published theme state both verified
BB_PUBLIC_URL=http://127.0.0.1:4185/c/e2e-bb-mv2kt82x
AC_FIXTURE=PASS — organization 54d0a5a7-5183-4f47-9963-aafdea66e7dc; slug e2e-activeclinic-mv2kt82x; clinic/facility provisioned through submitAndProvisionClinicRegistration
AC_PUBLISHED_THEME=ac.default; persisted draft and published theme state both verified; website_published=true
AC_PUBLIC_URL=http://127.0.0.1:4186/clinics/e2e-activeclinic-mv2kt82x
BB_HEALTHZ=PASS — HTTP 200, V5 foundation, schemaCompatible=true
AC_HEALTHZ=PASS — HTTP 200, V5 foundation, schemaCompatible=true
BB_BROWSER_RESULT=PASS — Chrome 154 via explicit executable; HTTP 200; visible organization name, BlessBoard shell/navigation, main content, and theme-rendered page verified
AC_BROWSER_RESULT=PASS — Chrome 154 via explicit executable; HTTP 200; visible clinic name, ActiveClinic shell/navigation, main content, and ActiveClinic theme-rendered page verified
BB_SCREENSHOT=/tmp/v209-bb.png
AC_SCREENSHOT=/tmp/v209-ac.png
BROWSER_ERRORS=Each page recorded one 404 resource response reported by Chrome console; the document itself returned 200 and rendered correctly. No fatal JavaScript errors or navigation failures occurred. Treat the missing resource as a nonfatal asset/request warning requiring follow-up if it is not an expected favicon/static lookup.
PRODUCT_DEFECTS=No confirmed product defect. One nonfatal 404 resource per page should be identified in a later browser-hardening pass.
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_FIRST_BROWSER_PASS_COMPLETE

Both temporary product-profile servers and browser sessions were closed.
The disposable fixtures remain in getpro_v209_e2e_test for the next responsive
testing phase. A provisioning script emitted a post-provision reporting
TypeError after both records were created; persistent state and browser results
were independently verified afterward.
