# Security contract tests

The AC-05 routes still use `requireApex` and `requirePlatformAdmin`. The contract does not remove either guard. The in-process denial in `tests/v13/unit/d22-ac05-admin-denial.test.js` is not live authenticated evidence.

New service-boundary results, all before a database call:

- An organization administrator cannot grant that role to themself (`self_escalation_denied`).
- A raw permission list is `raw_permissions_denied`.
- A grant whose organization id is not the actor's is `cross_organization_denied`.
- `organisation_administrator` is not an ActiveClinic catalogue role.
- A facility-scoped grant without a facility id is `invalid_scope`.
- An expired organization-admin assignment cannot grant the role.
- A CSRF token signed with one `SESSION_SECRET` fails under another.
- An ActiveClinic OTP lookup does not see a BlessBoard challenge. An unknown product is `unknown_product`.

D22's 195 passing tests stay the historical record from `2026-11-14T23:19:14+0200`. They were not re-run as that isolated set.
