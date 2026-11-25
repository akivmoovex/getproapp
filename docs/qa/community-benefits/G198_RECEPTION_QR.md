# G198 reception check-in

`Reception > Community Check-in` is `/app/reception/community-check-in`. The page is registered on the clinic app and is also covered by the isolated test server. Camera access is not required. The same POST accepts a scanned value or the fallback code.

The page shows the active clinic, the code field, service, quoted ngwee amount, local patient id, and an explicit confirmation checkbox. Cancel redirects back to the empty form. A missing actor, a billing role, a clinic that is not the actor's clinic, a bad code, an expired code, and a revoked code are refused. The response does not include another clinic's chart text.

Browser evidence is mock-backed. See `G207_PLAYWRIGHT_RESULTS.md`.
