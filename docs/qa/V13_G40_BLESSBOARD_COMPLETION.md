# V13 G40 — BlessBoard completion

No BlessBoard source was changed.

Website themes, drafts, and publish remain in the existing website and content services. `websiteStructuredDraftService.js` still maps sermon `preachedAt` and event `startsAt`. Public-page rows were not inserted. BB-06 stays partial.

Media uploads stay fail-closed. `areMediaUploadsEnabled` is false when `BLESSBOARD_MEDIA_UPLOADS_ENABLED` is absent, and true only for an explicit enable value. The upload HTTP layer still refuses the request when the switch is off. No production storage client was added. BB-11 stays partial.

Member creation still requires address, marital status, next of kin, relationship, and kin phone. The add form still posts one CSRF token. Portal activation stays a separate action. No membership parser was rewritten.

Announcements still require the `public` audience for the public list. Sermon and event create controls stay the D27 editors. Prayer stays a member-request category. Reporting stays unexecuted, so BB-16 stays blocked.

```
BB_IMPLEMENTED=13
BB_PARTIAL=3
BB_BLOCKED=1
MEDIA_UPLOADS=FAIL_CLOSED
PUBLIC_PAGE_ROWS=NOT_INSERTED
```
