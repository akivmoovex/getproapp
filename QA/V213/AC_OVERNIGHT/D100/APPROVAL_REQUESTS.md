# Approval requests

These are missing. None is granted by this stage.

| Approval | Why the package is not ready |
|---|---|
| `GETPRO_V13_ALLOW_DB_WRITES=1` and `GETPRO_V13_DB_STAGES_AUTHORIZED=1` | `runGated` returns `NOT_RUN` and fixture apply throws `V13_FIXTURE_HOLD` |
| A local disposable URL and `GETPRO_V13_CI_RUN_ID` with `DATABASE_IDENTITY_ENV=testing` and `GETPRO_TEST_DB=1` | The guard has nothing to accept |
| Migration authorization | The integration command does not migrate, and no migration was approved |
| Foundation bootstrap | Not approved, and the ActiveClinic provisioner does not insert the `v13d19` clinic keys |
| `GETPRO_V13_BROWSER_AUTHORIZED=1` | `hold()` throws |
| Persisted synthetic AC-05, portal, and appointment rows | The AC-05 plan is `persisted: false`. Capacity still throws `APT-01-03_NOT_IMPLEMENTED` |
| ActiveClinic teardown | There is no clinic-row cleanup. Only a later drop of the owned database name is safe |
| Stage A push trigger | Not approved, and it would not run G2 or G3 |

Do not point either command at a hosted or shared database.
