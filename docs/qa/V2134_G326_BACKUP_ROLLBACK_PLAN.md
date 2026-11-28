# V2134 G326 backup and rollback plan

BACKUP_EXECUTED=NO. No hosted backup was taken. No restore was performed. No laptop dump of a hosted database was run.

Classification of the current hosted backup: UNKNOWN. A written procedure is not evidence that a snapshot exists.

## What must be backed up before any later restart

The operator takes one hosting-panel backup of the testing database only, after confirming `platform.database_identity` is `moovex-platform-v7` / `testing`.

Include the database, not a production project. Record the snapshot id, the time, and the `/healthz` SHA outside git. Do not put a connection string, password, or session secret in the ticket or in this repository.

Also record that uploaded media lives in the `testing` media namespace. A database backup does not by itself prove object storage was copied. If the later change cannot alter media files, say that in the ticket. This candidate does not change media code.

Do not back up or restore through local port `5432`. Do not restore onto a production database.

## When the backup is required

The running SHA already matches `c947d26cb57e1456c843ba45e06130db074f8c16`. A second checkout of the same SHA does not need a new migration.

Take the backup before either of these later actions:

- changing `GETPRO_GIT_BRANCH`
- restarting testing workers
- applying any SQL, including the unapproved OTP or Community Benefits files

Do not apply `048_otp_challenges.sql`. It is not in the repository. Do not execute `docs/qa/community-benefits/V2132_COMMUNITY_BENEFITS_SCHEMA.sql`.

## Rollback

Last SHA observed before the host reported the candidate: `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a`.

If a later branch change or restart leaves either host unhealthy, on a different SHA, or on `environment=production`:

1. Stop. Do not apply a repair migration.
2. In the testing app only, check out `e7dbb72bbc11eb574d1a162eac78bfdcba5ddf0a` unless the operator has a newer recorded-good SHA from the pre-change `/healthz`.
3. Put `GETPRO_GIT_BRANCH` back to `V11` if this change was what altered it.
4. Restart only the testing workers with the panel’s normal command, `node index.js`.
5. Read both `/healthz` endpoints. Require `ok=true`, `deploymentCode=moovex-platform-testing`, `environment=testing`, and the rollback SHA prefix.
6. Restore the testing database only if the later action wrote schema or data and the owner approves that restore. This candidate has no migration, so a code rollback does not require a database restore.
7. Do not restore a production database. Do not delete clinic or patient rows as a rollback method.

## Worker start

Testing workers start with `node index.js`. `jobsEnabled` stays false. Both product hostnames are served from the testing deployment, selected by hostname. Confirm the panel app is `moovex-platform-testing` before any restart.

This plan does not authorize that restart.
