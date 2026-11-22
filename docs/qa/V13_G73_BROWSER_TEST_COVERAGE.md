# V13 G73 browser test coverage

Playwright was not run. Browser authorization flags were not set.

The ActiveClinic spec now has 20 named tests. The two new tests call `hold()` before navigation:

- `G66 reference rule preview is not saved` opens `/app/diagnostics/laboratory/reference-rules`, checks the not-saved notice, the CSRF field, and the test-code input.
- `G67 prescription editor explains the pharmacy queue` opens the prescription editor for `E2E_AC_ENCOUNTER_ID`, checks the manual-entry text, the medication field, the queue explanation, and the catalogue input.

The BlessBoard spec still has 23 named tests. Existing journeys for registration, members, website, sermons, events, announcements, and media remain in those files and remain `NOT_RUN`. No test was reduced to a title or HTTP 200 check. `hold()` still requires the browser flag and both database-write flags.
