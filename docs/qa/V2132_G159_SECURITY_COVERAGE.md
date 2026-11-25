# G159 security coverage

Re-executed in both full cycles:

- Unauthenticated vitals post is redirected to login or rejected, and 140 bpm is absent after reload.
- Logout closes ActiveClinic patient pages and BlessBoard HQ member creation.
- CSRF: BlessBoard member create rejects a missing token. Logout uses a fresh shell token. A token captured before later navigation was rejected with 403 in a probe and was not used in the passing test.
- Role denial: receptionist cannot open the worklist, documents, pharmacy, laboratory, or billing.
- Clinic isolation: wrong-clinic portal activation is denied. Website content stays on the owning clinic.
- Church isolation: sermons, events, and announcements are absent on the other church. Invitations cannot escalate into the other church.
- Cross-product themes: a church theme is rejected on a clinic and a clinic theme is rejected on a church.
- AC-05: a signed-in user who is not a platform administrator receives 403 or 404 for `/admin/settings/test-database` and the preview. The response body does not contain `Test Database Management`. Those routes are GET, so the denial is not followed by a mutation request. The guards were not changed.
- Invitation replay and role escalation stay denied.
- Safe errors: recovery and reset pages do not print the testing code.
- OTP codes are not rendered. Production activation stays blocked.

Test-database management authorization is the AC-05 denial above. No credential or OTP value is copied into this document.
