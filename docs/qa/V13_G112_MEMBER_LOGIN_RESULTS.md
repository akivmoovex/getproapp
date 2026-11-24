# V13 G112 member login

BB-06 login passes in both full BlessBoard Playwright runs.

The member form, the post, the dashboard, and logout stay under `/c/{organizationKey}` when the request is mounted there. Apex `/member/login` still has no church context, and the test confirms the Church ID field is absent there. An unknown organization key returns “Not found.”

A wrong password stays on the login page with an alert. The correct password opens the dashboard for that church and shows the member name and church name. Opening the other church’s `/member` path returns “You do not have member access to this site.” The path middleware now binds the organization in the URL instead of keeping an earlier session church. Logout returns the member to the login form.

The Church ID is loaded with the member record and shown on the HQ created page. The journey creates a run-owned member, activates the portal invitation, and then signs in. Administrator login in the rest of the suite still succeeds.
