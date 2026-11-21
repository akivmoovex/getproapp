# V2.13.1 G06 — BlessBoard functional completion

The regression reports already required these workflows, and the current source still implements them. No church policy was added. Existing gated HTTP and Playwright files were left in place and were not run.

## Membership

Staff registration requires name, phone, branch, address, marital status, and next of kin. Email stays optional. A duplicate match can be reviewed and is not silently merged. Creation stays behind `members.create` and one CSRF field. Portal access stays `not_activated` until the separate activation flow. Profile edits cannot change the church id, and a member cannot move their own branch.

## Website, sermons, and events

Theme application rejects a theme from the other product. Draft save does not publish. The sermons page has Add sermon, and a date plus description becomes `preachedAt` and `summary`. The events page has Add event, and date, times, description, and location are kept for the public event. Public sermon and event lists still show published items. Church public-page rows for the regression fixture were never inserted, so BB-WEB-08 stays partial.

## Announcements and media

Announcements have draft and published states, an audience, and pinned ordering. The public list requires the `public` audience. Uploads stay off unless `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is set. This phase did not set that flag and did not call a storage provider.

## Recovery

OTP stores hashed codes, rejects an expired or already-used code, and refuses the test provider when the deployment is production. No production SMS or email provider was enabled.

## Other modules

Repository routes already cover attendance, giving, broadcasts, branch and HQ administration, invitations, and member requests. Prayer is a member-request category, not a separate module. None of those were widened.

```
FINAL=V2131_G06
MEMBERSHIP=PRESENT_HTTP_NOT_RUN
WEBSITE=PARTIAL_PUBLIC_PAGES_UNWRITTEN
THEMES=PRESENT_HTTP_NOT_RUN
SERMONS=PRESENT_HTTP_NOT_RUN
EVENTS=PRESENT_HTTP_NOT_RUN
ANNOUNCEMENTS=PRESENT_HTTP_NOT_RUN
MEDIA_UPLOAD=FAIL_CLOSED
OTP_RECOVERY=TESTING_ONLY_HTTP_NOT_RUN
OTHER_MODULES=INVENTORIED_NOT_EXPANDED
SAFE_TESTS_PASSED=462
SAFE_TESTS_FAILED=0
BLOCKERS=HTTP and browser NOT_RUN; BlessBoard public-page fixture rows absent; media uploads remain disabled; G07 prompt was not in this request
```
