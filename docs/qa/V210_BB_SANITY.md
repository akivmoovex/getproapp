# V2.10 BlessBoard Sanity

Date: 2026-10-17  
Branch: V10

## Result

The bounded BlessBoard sanity batch ran 111 tests: 103 passed, 7 failed, and 1 skipped.

Passing coverage included registration and canonical website provisioning, website-engine publication, tenant isolation/RBAC, announcements, image-management contracts, member portal access/navigation, and new-tenant provisioning.

The seven failures were all in `tests/blessboard-branch-service-times.test.js`. The service-time fixture returned `lookup_error` and related routes returned HTTP 503, indicating the isolated PostgreSQL test environment was unavailable or incomplete. No product defect was confirmed.

The one skipped test was the PostgreSQL-backed pastoral-care suite, skipped by its `isPgConfigured()` guard. Database-backed member persistence, prayer persistence/pastoral review, and full desktop/mobile browser coverage were not established in this run.

## Coverage limitations

- No production data or external message delivery was used.
- No runtime code was changed.
- Desktop 1440px and mobile 390px browser coverage was not run in this bounded CLI batch.
- Branch service-time inheritance/override and public timing behavior remain blocked on isolated database readiness.

## Release blockers

BlessBoard release sanity is blocked pending a configured isolated PostgreSQL database and a bounded rerun of the service-time, member/persistence, prayer/pastoral, and browser suites.
