# V2134 G327 hosted identity verification

FINAL=V2134_G327_HOSTED_QA_READINESS

This session did not deploy, did not restart workers, did not change Hostinger configuration, did not take a backup, and did not write to the hosted database. One read-only database transaction was opened and rolled back. Sensitive identifiers from that read are in the gitignored operator file `.v13-isolated-pg/g327-operator-identity.md` (mode `0600`). They are not repeated here.

## Code

| Check | Result |
| --- | --- |
| Worktree | `~/Development/getproapp-v13` |
| Branch | `V13` |
| Expected HEAD at the start of this review | `5ae57d1f3195ea60269134dba478055f7055aa9c` |
| Named hosted candidate | `c947d26cb57e1456c843ba45e06130db074f8c16` |
| Local and `origin/V13` when this report was written | `5550bc0eabf7aa66bc9335555fc7d4e57eb72416` |
| `main` | local `44eafec486a18aeef2777bbcc9683e43f68ebe0d`, not changed |
| Product version on both About pages | 2.13.4 |

`c947d26cb57e` is an ancestor of the running commit. The commits after it are documentation only: the G326 preflight, then `docs(v13): map the 32 ActiveClinic Stitch concepts without implementing them`. No SQL file and no application source changed in that range. This review did not redeploy `c947d26cb57e`.

`origin/V11` remains `fbe7bea01f4e8d107b519b52b68e42e5b1c55686` from 30 October 2026. That commit does not contain the running SHA.

## What the hosts reported

Both `https://blessboard.pronline.org/healthz` and `https://activeclinic.pronline.org/healthz` were read. They match each other.

| Field | Both hosts, last pre-report read |
| --- | --- |
| HTTP | 200, `ok=true` |
| gitSha | `5550bc0eabf7` |
| Full SHA | `5550bc0eabf7aa66bc9335555fc7d4e57eb72416` |
| environment | `testing` |
| deploymentCode | `moovex-platform-testing` |
| branch | `V11` |
| branchSource | `GETPRO_GIT_BRANCH` |
| jobsEnabled | false |
| schemaCompatible | true, code `ok`, missing checks none |
| mediaWriteNamespace | `testing` |

The named candidate was not the running SHA at any read in this session.

| Time (UTC) | Observed gitSha | Meaning |
| --- | --- | --- |
| 2026-11-28 07:00 | `5ae57d1f3195` | Already past `c947d26cb57e`. G326 had recorded `c947d26cb57e` and then pushed the docs commit. |
| 2026-11-28 07:03 | same SHA, new worker processes | Both hostnames started within one second of each other. |
| 2026-11-28 07:11 | `5550bc0eabf7` | New shared checkout. The commit was created in this worktree at 09:08:58 +0200 and was already on `origin/V13`. |

This session did not create `5550bc0eabf7` and did not push it.

## Checkout source

`/__platform/runtime` is the testing diagnostic. It does not return a connection string. Both hostnames reported the same checkout directory under the Hostinger hbuild tree, the same SHA, and the same database fingerprint.

The first shared version directory observed with `5ae57d1f3195` was `01a220ef-0c7c-7196-b256-7358876c2cef`. The directory observed with `5550bc0eabf7` was `01a220fc-6fa0-732b-ae91-d5c4bce32234`. A new version directory means the checkout was replaced. A process restart of one directory would keep that directory.

`GETPRO_GIT_SHA` is unset. The SHA is the checkout's git metadata. `GETPRO_GIT_BRANCH` is set and `src/platform/runtime/buildIdentity.js` prefers that live value over the git branch. That is why the label stays `V11` after the checkout moves.

GitHub does not explain the move. The repository has no deploy workflow run for these commits, no deployment objects, and no repo webhooks were listed. The default branch is `main`. `main` does not contain these commits. The documented Hostinger git deploy catches up a few minutes after a push to the connected branch. The observed lag was about nine minutes for `5ae57d1f3195` and about two minutes for `5550bc0eabf7`.

AUTO_DEPLOYMENT_STATUS=INFERRED_ACTIVE. The panel toggle was not opened. The behavior is that a push to `origin/V13` is followed by a new hbuild directory and a new `/healthz` SHA, while the `V11` label remains.

A later application restart, by itself, reloads the panel environment. It does not correct `V11` while `GETPRO_GIT_BRANCH` stays `V11`. It also does not, by itself, replace the current hbuild directory. A new deploy of the connected branch does replace the directory. Because the connected branch is behaving as `V13`, a deploy now would check out the current `origin/V13` tip. It would not check out `origin/V11`.

Both product hostnames are workers of one testing app. They share the checkout, the deployment code, the media root `/home/u549637099/moovex-media`, and the database fingerprint below. Their process ids differ.

## Database

Public `/healthz` does not include the database name. `/__platform/runtime` does. Both hosts reported:

| Field | Value |
| --- | --- |
| Source variable | `DATABASE_URL`, injected by the host |
| Host | `aws-0-eu-central-1.pooler.supabase.com` |
| Port | `5432` |
| Database name | `postgres` |
| Expected identity | `moovex-platform-v7` |
| Expected environment | `testing` |

The local production credential uses the same host, port, and database name and a different project login. Host plus port plus database name do not distinguish the projects. The production credential was not used.

The operator testing credential uses that same host, port, and database name, expects `moovex-platform-v7` / `testing`, and is a different project login from production. One `BEGIN READ ONLY` transaction on that credential returned a single `platform.database_identity` row: identity `moovex-platform-v7`, environment `testing`, database name `postgres`, matching `current_database()`. The transaction was rolled back. The in-database role name is `postgres` because the pooler maps the project login to that role. The database owner is that same role. The role is not a superuser. It can log in, inherit, create databases, create roles, use replication, and bypass row-level security. Schema owners for `platform`, `activeclinic`, and `blessboard` are that role. `public` is owned by `pg_database_owner`.

The instance id, server address, and project logins are only in the restricted operator file. The Hostinger panel connection string was not opened. The identification is the testing credential whose fingerprint matches both hosted runtimes, not a copy of the panel secret.

HOSTED_DATABASE_IDENTIFIED=YES.  
DATABASE_OWNER_IDENTIFIED=YES.

## Migration ledger

The read-only ledger, compared with source files and excluding duplicate `* 2.sql` copies:

| Module | Hosted rows | Hosted maximum | Source maximum | Gap |
| --- | --- | --- | --- | --- |
| platform | 47 | `047_approval_request_foundation.sql` | `047` | none |
| activeclinic | 42 | `042_patient_visit_summary_releases.sql` | `044_laboratory_reference_rules.sql` | `043`, `044` not applied |
| blessboard | 122 | `122_department_join_request_v204.sql` | `130_member_portal_invitations.sql` | `123` through `130` not applied |
| getpro | 1 | `001` | `001` | none |
| ngo | 1 | `001` | `001` | none |

`db/migrations/platform/048_otp_challenges.sql` is absent from source and from the ledger. No community-benefits relation was present. `schemaCompatible=true` is the V7 check list on `/healthz`. It is not a statement that every source file has been applied. No migration was executed.

## Backup

BACKUP_VERIFIED=NO. No snapshot id, retention period, encryption setting, or restore test for this database was found. Supabase plan backups were not opened. A written plan is not evidence that a snapshot exists.

BACKUP_RESTORE_PROCEDURE_VERIFIED=NO. `docs/qa/V2134_G326_BACKUP_ROLLBACK_PLAN.md` says what a later operator must do. It was not executed. `docs/qa/V212_BACKUP_RESTORE_VERIFICATION.md` restored a local disposable database and did not contact this host.

The responsible operator for a future testing-database backup is the Hostinger and Supabase owner. This session did not take that backup and did not restore anything.
