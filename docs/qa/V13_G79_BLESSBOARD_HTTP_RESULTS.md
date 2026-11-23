# V13 G79 BlessBoard HTTP results

Database: `getpro_v13_e2e_g78d2301` on `127.0.0.1:55432` only.
Final run: `.v13-isolated-pg/g79-http10.log` (`G79_PREFLIGHT_OK`).
Fixture suffix: `g78http05`.
`BLESSBOARD_MEDIA_UPLOADS_ENABLED` was unset.
`BLESSBOARD_OTP_PROVIDER=test` was set for this disposable run only.

Leaf tests in the final run: 34 executed, 16 passed, 18 failed, 0 skipped.
Failed BlessBoard tests below are not passes.

## Passed

| Test | What it showed |
| --- | --- |
| BB-01 | A homepage section is created, isolated to its church, and removed with that church's rows. |
| BB-02 | One announcement is published and hidden from the other church. |
| BB-03 | One event is stored. An end time before the start and a foreign branch are rejected. |
| BB-04 | One sermon is stored. A slash date and a non-HTTPS media URL are rejected. |
| BB-05 | One member is stored. Cross-church confirmation and a duplicate submit are rejected. |
| BB-MEM-02 | The member form returns 403 for a missing CSRF token and 403 for a mismatched token. |
| BB-REG-07 | A duplicate church phone keeps a single normalized registration. |
| BB-MEM-01 | The member form shows the mandatory fields and completes registration. |

## Failed

| Test | Result | Cause |
| --- | --- | --- |
| BB-06 | Failed | Member activation returned `authenticated_ownership_required`. |
| BB-24 | Failed | The posted-church enquiry returned 400. The test expected 404. |
| BB-AUTH-04 | Failed | Testing OTP recovery did not capture an expired code (`assert.ok(expiredCode)`). |
| BB-ANN-01 | Failed | The public announcements page did not render `data-bb-announcements="1"`. |
| BB-WEB-08 | Failed | Theme page redirected 303 to `/c/.../website/themes`. The test expected 200. |
| BB-WEB-09 | Failed | Public sermons page did not render `data-bb-sermons="1"`. |
| BB-WEB-10 | Failed | Public events page did not render `data-bb-events="1"`. |
| BB-ANN-02 | Failed | Attachment upload returned 403 `media_uploads_disabled`. No upload adapter was configured. |
| INV-01 | Failed | Staff invitation returned `conflict`. |

## Scenario coverage

| Scenario | Result |
| --- | --- |
| Church registration | BB-REG-07 passed for the duplicate-phone path. |
| Duplicate church phone | Passed. |
| Member registration | BB-05 and BB-MEM-01 passed. |
| Member CSRF | BB-MEM-02 passed for missing and invalid tokens (403). |
| Branch authorization | BB-03 passed for a foreign branch. |
| Website theme application | Failed in BB-WEB-08. Clinic theme isolation passed separately in AC-WEB-09. |
| Draft persistence | Sermon and event drafts were stored by BB-04 and BB-03. The later public-draft tests failed. |
| Website publishing | Announcement publication passed in BB-02. Theme and public sermon/event publication tests failed. |
| Public-page rendering | Failed in BB-ANN-01, BB-WEB-09, and BB-WEB-10. The expected public markers were absent. |
| Sermon creation and publication | Creation passed in BB-04. Public publication isolation failed in BB-WEB-09. |
| Event creation and publication | Creation passed in BB-03. Public publication isolation failed in BB-WEB-10. |
| Announcement publication | Passed in BB-02. |
| Public announcement visibility | Failed in BB-ANN-01. |
| Media-upload disabled state | Observed. BB-ANN-02 received 403 `media_uploads_disabled`. The test itself failed because it expected 200. |
| Synthetic media upload | Not executed. No safe test storage adapter was configured, and the upload flag was left unset. |
| Media ownership and access denial | Not executed. |
| OTP testing-mode recovery | Failed in BB-AUTH-04 before the replay assertion. |
| Church isolation | Passed for announcements (BB-02), members (BB-05), and foreign branches (BB-03). |

## Fixture notes

HTTP applies use a per-process church key and email so they do not collide with the G78 churches `v13d19-church-a` and `v13d19-church-b`.
Cleanup removes church-owned rows. It does not delete append-only audit events or the organizations those events reference.
Member drafts now send address, marital status, and emergency-contact fields required by the form validator.
