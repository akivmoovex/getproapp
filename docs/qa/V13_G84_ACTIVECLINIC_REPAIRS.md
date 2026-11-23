# V13 G84 ActiveClinic repairs

Repairs were limited to defects the G82 and G83 logs reproduced. Booking stayed disabled. No clinical policy and no new migration were added.

## AC-AUTH-04

The HTTP suite already completed one reset and rejected a second GET of the same token with 400. The browser failure was `page.request.post` staying open until the 90 second test timeout. The replay check now opens the used link in the browser and requires the used-or-invalid message, with no success text. The focused browser rerun passed in 1.7 seconds. The password is restored after the test. CSRF was not bypassed.

## AC-WEB-08

Still failing. The section settings GET is 404, so the page has no CSRF field. The browser publish path still does not show the new heading on the public clinic page. Not marked fixed.

## AC-WEB-09

The HTTP theme test is not in the G88 failure list: a new clinic can apply `ac.family-wellness-mint` and the draft HTML matches. The existing clinic's browser preview still renders `gp-website-theme--ac-default` after the theme API returns `{ published: false, themeId: "ac.family-wellness-mint" }`. That preview mismatch remains open.

## AC-REC-02

The HTTP patient post omitted `step`. The form parser defaults a missing step to `edit`, so the record was never created and the fixed name `D05 Walker` also hit duplicate review. The HTTP scenario now sends `step=confirm` and a unique surname. That HTTP test passed in `.v13-isolated-pg/g88-http.log`.

The browser check-in on the existing clinic, signed in as the receptionist, still returns the generic error page at `/app/reception/walk-in`. A foreign-key or check failure in walk-in arrival insert is now returned as invalid input instead of an uncaught exception. The existing-clinic 500 remains open.

## AC-REC-03

Heart rate is an `<option>` inside a closed `<select>`. Playwright's visibility check failed even though the option was in the document. The browser test now counts that option, saves 72 bpm, and treats an unauthenticated 303 to `/login` as the denial. The focused browser rerun passed. The other clinic's vitals GET is 403, so the HTTP scenario asserts that denial directly instead of requiring a CSRF field on a forbidden page.

## Not claimed

AC-WEB-08, the existing-clinic walk-in error, and the existing-clinic mint preview are still failing.
