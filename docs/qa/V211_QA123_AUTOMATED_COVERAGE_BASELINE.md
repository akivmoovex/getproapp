# QA123 Automated Coverage Baseline

The branch is `qa-v211-overnight-20261017` at
`3df272ba6388b2a2360cd77b665aeba8ee8cacd3`. The repository contains
node:test, Supertest and Playwright suites. No reliable per-file coverage
instrumentation is configured in the package scripts, so coverage percentages
are not claimed.

The V2.11 member implementation is covered by the invitation, acceptance,
approval, login and security test files plus QA reports. Existing legacy
church tests still reference `public.tenants`; that table is intentionally
absent from the V5 disposable database. The six-bug register and ActiveClinic
shared-platform suites were inventoried but not all were executed.

Executed static security group: 32 tests, 30 pass, 2 fail. Failures are
stale route-audit expectations for the new invitation routes.
