# V13 G97 browser repair results

Latest run: ActiveClinic `.v13-isolated-pg/g91-ac.log` is 20 executed, 18 passed, 2 failed. BlessBoard `.v13-isolated-pg/g91-bb.log` is 23 executed, 2 passed, 21 failed. Combined: 43 executed, 20 passed, 23 failed, 0 skipped.

The previous full browser run had the same combined totals.

Passing browser scenarios include AC-REC-02, AC-REC-03, AC-AUTH-04, and AC-PUB-01.

Still failing:

- AC-WEB-08: the public page does not contain the new section heading.
- AC-WEB-09: the existing clinic preview stays `ac.default`.
- BlessBoard: 21 scenarios. Public pages do not show the content markers. Invitation and OTP tests stop because the plaintext secrets were not retained. The homepage editor route was corrected to `/hq/content/pages/home`, and the heading is still not visible after save.

No browser failure was skipped.
