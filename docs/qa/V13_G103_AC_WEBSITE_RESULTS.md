# V13 G103 ActiveClinic website results

AC-WEB-08 and AC-WEB-09 pass in both full ActiveClinic Playwright runs (`g107-ac1.log` and `g107-ac2.log`, 20 passed, 0 failed).

AC-WEB-08 opens the existing clinic editor, saves a section heading, accepts the publish confirmation, waits for `POST /clinics/{key}/website/publish`, and reads the heading on the public page.

AC-WEB-09 rejects a cross-product theme, opens `/clinics/{key}?website_mode=draft` without a preview override, sees `gp-website-theme--ac-family-wellness-mint`, publishes, and sees the same class on the live page.

Both journeys are `VERIFIED_E2E`. The HTTP runners for these ids were already passing and were not weakened.
