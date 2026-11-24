# V13 G113 staff invitation

INV-01 accept and INV-01 login pass in both full BlessBoard Playwright runs.

The HQ invite form now offers Website editor. That role is already in `INVITE_ROLES` and its permission map is `website.view` and `website.edit`. It does not include `members.create`. The church administrator issues the invitation. The copy-once link uses the request host so the test server port is included. Acceptance sets the password once. A second visit shows “Invitation unavailable” and no password form.

After sign-in, `GET /hq/members/new` returns 403 and the member form is absent. The other church’s roles page does not list the invited email. The church administrator can still open member creation in the later suite tests.

Expiry is already denied by `acceptInvitation` when `expires_at` has passed. The browser run did not backdate a token. Replay is the browser denial that was executed.
