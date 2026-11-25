# G157 BlessBoard member and church coverage

Both BlessBoard Playwright cycles passed 23 tests. The extra member journey was added inside `BB-MEM-01` because another administrator login in the same server process crosses the in-memory limit of 20 attempts for that identifier.

`BB-MEM-01` now does all of the following on one login:

- Required name, phone, and branch are marked required.
- A synthetic member is created and the created page shows `not_activated` and a `CH-` id.
- View member opens the profile. Reload still shows the email and the unique stamp.
- Directory search by that stamp shows the member.
- Search for `NoSuchMember999999` does not show the email.
- Logout uses the CSRF token on the current HQ shell and returns `/hq/members/new` to login with no member form.

The first full-suite attempt failed on the unfiltered directory. The church had 81 members, the page size is 20, and the order is last name then first name. The newest timestamp sorts off page 1. Search is the read-back. That is the product behavior, not a dropped member id.

Also re-executed: duplicate church phone, member activation, member login, recovery without showing the code, CSRF denial, single-use invitation, invitation replay denial, and website-editor denial of member creation inside the invitation test.

A second BlessBoard administrator login was not added.
