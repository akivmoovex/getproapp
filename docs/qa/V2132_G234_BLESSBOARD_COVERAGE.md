# G234 BlessBoard coverage

The 23 existing BlessBoard browser journeys and the HTTP regressions cover
church registration/login, members, activation, invitations, roles,
multi-church isolation, website draft/theme/publish/public read-back,
sermons, events, announcements, branch context, CSRF and mobile shell
behavior. Persistence is verified in the authorized regression fixtures.

Deferred media upload remains disabled. Prayer requests and communications
are only counted where the current source exposes routes and tests; old
requirements are not treated as implemented functionality.
