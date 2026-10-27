# QA124 Test Harness Repair

The disposable database identity is `moovex-platform-v7/testing`. The
existing QA117/QA118 fixtures fail because they call legacy helpers that query
`public.tenants`; V5 explicitly does not contain that table.

The local server also selected the V5 foundation profile, whose startup
diagnostics skip legacy church login, member, HQ-admin, branch-admin and
portal routes. A real request to `/login` consequently returned `303` and the
POST returned `400` with “Sign-in must continue on the BlessBoard home site.”

No obsolete table was created, no product middleware was changed, and no
fabricated identity was used. Harness repair is blocked pending the supported
BlessBoard application profile/entrypoint for these routes.
