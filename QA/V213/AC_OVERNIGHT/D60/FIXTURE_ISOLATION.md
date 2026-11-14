# Fixture isolation

`applyActiveClinicFixtures` throws `V13_FIXTURE_HOLD` unless both write flags are `1` and `assertV13CiDatabaseUrl` accepts the URL. The guard allows only `127.0.0.1`, `localhost`, and `::1`. It refuses host markers such as hostinger, amazonaws, neon, and supabase, and it refuses shared names including `postgres`, `getpro_ci`, and `production`. The database name must come from `buildOwnedDatabaseName` for that run id. `DATABASE_IDENTITY_ENV` must be `testing`.

The plan uses synthetic clinic keys and the password `V13-synthetic-qa-password`. It is not applied. There is a BlessBoard cleanup function. There is no ActiveClinic cleanup function. `runAcAuth` does not delete the rows it would insert. A future run has to drop the run-owned database after the guard still accepts its name. This stage did not open a connection.
