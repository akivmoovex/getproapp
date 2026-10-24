# V211-BB-QA101 Migration 111 Drift Diagnosis

## Classification

`MIGRATION_ID_COLLISION`.

The current untracked file
`db/migrations/blessboard/111_member_portal_invitations.sql` hashes to:

`5790d77c96029c33710acc6ddb223e64003ee7d23e63cc4d73508cfcf642ec67`

The disposable database ledger records module `blessboard`, version `111`,
filename `111_announcement_schedule_v8.sql`, checksum:

`af8c1903b63aabc1a64b48735b60c9584407e9a1d4ceec085e3b3dfee2203b15`

The applied timestamp is `2026-10-24T20:27:31.451Z`. The repository already
contains the committed `111_announcement_schedule_v8.sql`; therefore version
111 is occupied by the announcement migration. The migration runner keys
identity by `(module, version)`, not filename, and correctly reports drift
instead of applying the member migration.

## Database object evidence

The database has 231 ledger rows and no pending migrations, with one drifted
row. `blessboard.member_portal_invitations` exists and is empty, but its
schema does not match the current member migration:

- Existing indexes include `member_portal_invitations_pending_member_uidx`
  on `(member_id, purpose)` and organization/church status indexes.
- Existing constraints include acceptance, expiry, purpose, revocation and
  updated-time checks.
- Existing trigger is
  `member_portal_invitations_validate_ownership`, calling
  `validate_member_portal_invitation_ownership()`.
- The current file defines a different scope trigger name/function and a
  different index set.

This proves the table was provisioned by another member-invitation revision or
schema path, while the ledger remains occupied by the announcement migration.
The evidence does not establish which historical process created the table;
no missing historical file was invented.

## Safe recovery recommendation

Do not rewrite the ledger, update checksums, delete migration rows, disable
drift checking, or apply version 111. Preserve the existing announcement
record and checksum. Reconcile the member table against the actual recorded
schema through an approved, additive migration with a new unused BlessBoard
version (the repository currently has later versions, so select the next
unoccupied version through the normal migration review). That migration must
explicitly handle the already-existing table, constraints and trigger names
idempotently.

If the disposable database must be rebuilt, obtain a separately approved
destructive disposable-database procedure. No recovery action was executed in
QA101.
