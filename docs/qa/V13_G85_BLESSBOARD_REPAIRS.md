# V13 G85 BlessBoard repairs

## Enquiry scope

`submitPublicChurchEnquiry` validated the body before it checked that the route had resolved a church. An unresolved church with an invalid body returned 400. The missing church is now 404, and a posted `church_id` is still ignored. The unit tests and the G88 HTTP BB-24 test passed.

## Media uploads

`POST /hq/announcements/media/upload` returns 403 `media_uploads_disabled` while `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is unset. The HTTP scenario now asserts that refusal and stops. It does not enable uploads. BB-ANN-02 is no longer in the HTTP failure list.

## Public sermon, event, and announcement pages

`/sermons`, `/events`, and `/announcements` returned a 741-byte setup page. `loadTenantPublicPageModel` returns `KIND.SETUP` when `publicWebsiteStatus` is not `published`. The templates that carry `data-bb-sermons`, `data-bb-events`, and `data-bb-announcements` are not rendered for an unpublished site. That is the shared cause of BB-ANN-01, BB-WEB-09, and BB-WEB-10. The unpublished site stays private. Those three HTTP tests remain failed.

## Theme gallery

`GET /hq/website/themes` returns 303 to `/c/{church}/website/themes`, and that page returns 200. The page does not contain the CSRF field the scenario extracts, so BB-WEB-08 still fails after the redirect is followed.

## Still blocked

Member activation returns `authenticated_ownership_required`. Staff invitation returns `conflict`. Browser invitation, OTP, and member-login journeys stop because the plaintext invite token and OTP were not retained. Those values were not invented. Production media upload stays off. Public booking policy was not changed.
