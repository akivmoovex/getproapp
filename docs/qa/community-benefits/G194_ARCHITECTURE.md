# G194 architecture

Modules live in `src/activeclinic/communityBenefits/`.

| Module | File |
| --- | --- |
| Flags | `flags.js` |
| Money | `money.js` |
| Memory store | `memoryStore.js` |
| Membership, acquisition, pass, link, eligibility, preview, ledger plan | `communityBenefitsService.js` |
| Routes | `routes.js` |
| Pages | `pages.js` |

`GETPRO_AC_COMMUNITY_BENEFITS_ENABLED=1` turns the routes on only when the process is not a production signal. `financialPostingEnabled()` returns false. The clinic server registers the routes with `allowTestActor: false` and no store. With the flag off the two paths return 404. With the flag on and no store they return 503. The router is mounted on `/app/community` and `/app/reception/community-check-in` only.

The navigation item is added inside `buildActiveClinicNavigation` when the flag is on and the staff member already has `activeclinic.reception.view`. It is not part of the frozen `NAV_ITEMS` list. No new permission was seeded.

Reviewed schema: `docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql`. It is marked `NOT APPLIED`. It is not under `db/migrations/`. It was not executed.

The memory store is injected by unit tests and by `tests/e2e/v13/communityBenefitsServer.cjs`. The foundation server does not inject it. Production does not fall back to that store.
