# V211-BB-QA142 Authorized HQ Invitation

## Authentication smoke

Using the existing QA75 administrator identity and `createV5Session` against
the authorized disposable database:

- anonymous `GET /hq/members`: `401`
- authorized `GET /hq/members`: `200`

The database identity is `moovex-platform-v7/testing`. The session was
created with the existing synthetic administrator, organization and church
scope; no role or permission was inserted.

## Staff invitation and registration

The QA137 HTTP files were executed with the real-run flag, but they are
placeholder prerequisite tests that intentionally call `assert.fail()` rather
than implement the workflow. All four therefore failed with
`Harness prerequisite is not available in this execution`; no invitation or
registration mutation occurred.

The browser staff-entry test remains blocked because `/hq/staff` does not
expose the Invite Staff control without a browser-authenticated HQ session.
The invalid-invitation browser denial passed in QA141. Staff invitation
creation, setup, activation and staff login were not executed.

No product source, migration, reset, protected database mutation, commit,
push or deployment was performed.
