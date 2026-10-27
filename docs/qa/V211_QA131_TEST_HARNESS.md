# V211-QA131 Canonical Test Environment and Browser Harness

## Verified

- Branch: `qa-v211-overnight-20261017`
- HEAD: `3df272ba6388b2a2360cd77b665aeba8ee8cacd3`
- V11 contains the checkpoint: yes, at the same SHA
- Database: `getpro_v211_qa_disposable_03`
- Identity: `moovex-platform-v7/testing`
- Playwright, Supertest and node:test are installed/configured

The Playwright harness default database was corrected from the protected
`getpro_v211_test_01` socket database to the authorized disposable database,
and explicit TEST_DATABASE_URL and FOUNDATION_DATABASE_URL defaults were
added. Tenant host allowlisting and the BlessBoard staging deployment code
are now explicit test-process settings.

## Browser result

The real Playwright HQ invitation smoke test executed with the authorized
database and tenant host, but failed before authentication with
`ERR_TOO_MANY_REDIRECTS` at `/login`. The server selected an incompatible
application/profile routing path; no authenticated browser result is claimed.
No database reset, migration, protected database access, hosted mutation or
product runtime change was made.

Legacy fixture dependency remains: older node:test helpers query
`public.tenants`, which is intentionally absent from the V5 database. The
next blocker is identifying the supported BlessBoard browser runtime entry
point/profile that mounts the V2.11 tenant authentication routes.
