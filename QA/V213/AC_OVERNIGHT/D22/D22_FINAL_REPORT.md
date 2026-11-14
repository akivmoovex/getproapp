# D22 final report

Branch `V13` and HEAD `b8f6b420d25e908de64ba292866c218c32edc30c` matched the expected baseline, so execution continued. The worktree was already dirty and those modifications were kept.

AC-05 is `GET /admin`, `GET /admin/settings/test-database`, and `GET /admin/settings/test-database/preview`, behind `requireApex` and `requirePlatformAdmin`. The catalogue role is `platform_administrator` with platform scope. The billing route is a different check.

In-process tests passed for the administrator read, the authenticated 403, the unauthenticated redirect, the non-apex host, the production deployment block, the scope refusals, CSRF, and a facility hint that this route ignores. They used a SELECT-only double. They do not close the live gate.

G1 ran 195 tests, 195 passed, 0 failed. Integration and browser suites were not started. No database write, migration, production call, commit, or push occurred.

The persisted lower-privilege principal is still not created. G3 remains held until a disposable database and browser run are approved. AC-05 live denial is `NOT_RUN` and the release gate stays `BLOCKED`.
