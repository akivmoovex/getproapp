# Fixture and bootstrap plan

Bootstrap and migrations are not approved. `applyActiveClinicFixtures` still throws `V13_FIXTURE_HOLD` before a query. The provisioner, when later authorized, mints `ac-hqa-` clinics. It does not insert Pat Ient or the AC-05 users.

Teardown, when a run is later authorized, is `DROP DATABASE` of the run-owned name only after the guard still accepts that name. `postgres` and a rejected name are not drop targets.

No fixture was applied. No migration ran. The thirteen `*.integration.test.js` files stay the prepared set. A fourteenth file was not added.
