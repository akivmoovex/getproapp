# V2.13.2 G135 — website content publication

Branch `V13`. AC-FU-WEB-02 status: VERIFIED_LOCAL_G78 for new text and an authorized https image reference. Binary upload is not verified. `BLESSBOARD_MEDIA_UPLOADS_ENABLED` was not turned on. Production media upload stays disabled.

## Path that was checked

Website section editor, save, live route before publish, explicit publish, public home, reload.

`pickValue` in `src/platform/website/resolver.js` still returns only the published value in live mode. Draft mode still prefers the draft. `publishWebsiteDraft` still copies changed draft keys to the published snapshot. Public status was not written with SQL.

## Fixes

`safeSectionLink` in `src/activeclinic/website/clinicWebsiteCms.js` rejects `javascript:`, `data:`, `vbscript:`, and protocol-relative `//`. Section and block saves return `invalid_url`, and the route says the website address is not allowed. The public home template does not emit an image or button whose URL starts with those schemes.

`resolveActiveClinicWebsite` hydrates each `cmsSections[].image` through `hydrateWebsiteImageValue`, the same ownership check used for hero, logo, about, and SEO images. An https URL is an allowed reference. Another tenant's media path and a relative `/media` path stay rejected.

The denied save replaces the form, so the browser test reopens the section from the list before saving the valid heading and body.

## Evidence

Playwright `AC-FU-WEB-02` in `tests/e2e/v13/v13-ac-platform-qa.spec.js`, on a run-owned clinic:

1. New heading and body are saved.
2. The live page does not contain the heading before publish.
3. After publish, the live page and a reload contain the heading and `Published body text`.
4. `javascript:alert(1)` is rejected.
5. `https://example.invalid/v13-synthetic-section.png` with alt `Synthetic clinic image` is absent on the live page before the second publish.
6. After publish and reload, that image `src` and alt are present.

HTTP `AC-WEB-08` in `tests/v13/integration/d05RegressionRunners.js` checks the same draft/live split, a second live read, the rejected script URL, and the published synthetic image. It also keeps the existing foreign-clinic overwrite denial. D05 passed on the final HTTP run.

Unit `tests/v13/unit/g135-section-link.test.js` checks the rejected schemes and the kept https URL.

Existing theme coverage stayed in `AC-WEB-09` (HTTP and Playwright). The full ActiveClinic Playwright file, including `AC-WEB-08`, `AC-WEB-09`, and `AC-FU-WEB-02`, passed 22 tests. BlessBoard Playwright passed 23 tests. BlessBoard website source was not edited.

## Not claimed

Binary file upload. Hosted QA. A production media store. Another clinic reading this clinic's draft. Public booking.

## Runs that include this fix

Final HTTP: 31 passed, 3 failed, of 34. The three failures are D14C, D16 platform OTP, and D25 slot. AC-WEB-08 passed inside D05.

ActiveClinic Playwright: 22 passed, 0 failed. BlessBoard Playwright: 23 passed, 0 failed.

Database-free suite: 552 passed, 0 failed, 2 skipped, of 554.
