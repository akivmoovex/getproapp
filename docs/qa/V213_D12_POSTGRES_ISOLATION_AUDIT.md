# V2.13.1 D12 — PostgreSQL privilege and network isolation audit

Branch `V13` remains `dac251c4d13ffd7c83b4e32c0bbe130a8d12a606`. The guarded wrapper `scripts/ci/v13-foundation-bootstrap.cjs` is present. `getpro_v13_e2e_regression213101` still passes the full name guard and does not exist. Database-write and browser authorization flags are disabled. No role, grant, database, migration, or container was created.

The server reports PostgreSQL 16.9 from Postgres.app. The `psql` client is 16.2. The server listens on port 5432 with `listen_addresses=*`, on both IPv4 and IPv6.

## Current privilege risks

The session role is the local OS login. Its attributes are superuser, createdb, createrole, inherit, and login. It does not have replication or bypassrls, and it is not a member of another role. The cluster has 16 roles: 2 superuser, 2 createdb, 2 createrole, 1 replication, 1 bypassrls, and 2 login roles.

That session can connect to every database that allows connections and can create or modify schemas in them. This was inferred from the superuser attribute. No cross-database connection or schema change was attempted.

There are 637 databases. 636 allow connections. 635 have no explicit ACL, so PostgreSQL’s default applies: `CONNECT` and `TEMPORARY` for `PUBLIC`. A new login role on this cluster would be able to connect to those databases until `CONNECT` is revoked from `PUBLIC` on each one. Doing that on this shared cluster would affect every existing local application, so it is not a safe regression step.

`pg_hba.conf` uses `trust` for all users on local sockets, `127.0.0.1`, and `::1`. It also has `trust` entries for `0.0.0.0` and for remote addresses. No password is required for a matching client. Combined with a listen socket on every interface, a non-local client that matches those rules can authenticate as a superuser.

## Dedicated role

Do not create this role on the shared cluster. On a later isolated instance, an administrative step outside the regression process would run:

```sql
CREATE ROLE v13_regression_213101
  LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
  NOINHERIT;
CREATE DATABASE getpro_v13_e2e_regression213101 OWNER v13_regression_213101;
REVOKE ALL ON DATABASE getpro_v13_e2e_regression213101 FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE getpro_v13_e2e_regression213101 TO v13_regression_213101;
```

The password is supplied at that later step from an uncommitted local secret, using SCRAM, and is never written into the repository. The regression application then uses only this login. Database ownership gives it `CREATE` inside that database, which is what the 221 migrations need in order to create schemas and tables. It does not receive `CREATEDB`, `CREATEROLE`, or any grant on another database.

The Foundation migrations do not contain `CREATE EXTENSION`, so the limited role can apply them, initialize `platform.database_identity`, and apply seeds `001`–`011`. Catalogue seeds that are production-gated still no-op when the identity is `testing`. Fixture inserts and the Supertest and Playwright runs use the same URL. The guarded wrapper accepts that URL when the host is loopback and the database name is exactly `getpro_v13_e2e_regression213101`.

Creating the role, creating the database, and revoking `PUBLIC` are the elevated operations. They stay in the administrative step. The application process must not use the superuser URL.

Teardown, only after a separate authorization and a passing isolation check:

```sql
DROP DATABASE IF EXISTS getpro_v13_e2e_regression213101;
DROP ROLE IF EXISTS v13_regression_213101;
```

## Network isolation

The shared Postgres.app instance cannot host this regression safely. Loopback enforcement in the connection string does not stop the superuser, the `trust` rules, or `PUBLIC` connect on the other 635 databases.

The recommended architecture is a separate PostgreSQL 16 instance used only for this run:

- Bind it to `127.0.0.1` on an unused port. Port 55432 was not listening during this audit.
- Its data directory contains only this disposable database plus the templates required by PostgreSQL.
- `pg_hba.conf` allows SCRAM for `v13_regression_213101` from `127.0.0.1` and `::1` only. It has no `trust` rule and no remote address.
- The regression URL uses that port, the limited role, and the exact database name.
- Docker is installed and can provide that instance later. No container was started.
- The existing Postgres.app listen address and `pg_hba.conf` stay unchanged.
- BlessBoard and ActiveClinic browser tests keep `http://127.0.0.1` and abort any request that is not localhost or `local.test`.

## Validation

Mock contracts confirm the wrapper source contains no `CREATE ROLE`, `GRANT`, or `CREATE DATABASE`, and that a URL for the `postgres` database does not load the Foundation module. Safe contract and unit tests: 409 passed, 0 failed. HTTP and browser suites were not run.

## Authorization still required

A later phase may create the isolated instance, the limited role, and the one database only after explicit approval. It must not grant the regression role rights on this shared cluster, must not revoke `PUBLIC` on the shared cluster, and must not point `DATABASE_URL` at the current superuser.
