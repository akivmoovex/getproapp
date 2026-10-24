# V211-BB-QA102 Migration Collision Repair

## Resolution

The existing announcement migration remains `blessboard/111` and was not
modified. The member invitation migration was renamed to the verified next
unused BlessBoard version:

`db/migrations/blessboard/130_member_portal_invitations.sql`

The repository's BlessBoard migration versions already extend through 129, so
130 is unused and resolves the collision.

## Reconciliation strategy

The migration remains additive and idempotent for both clean databases and the
disposable database's existing invitation table. It:

- creates the canonical table when absent;
- adds only missing compatibility columns with `ADD COLUMN IF NOT EXISTS`;
- rejects an incompatible `token_hash` data type explicitly;
- preserves existing rows, indexes, constraints and triggers;
- creates the pending uniqueness index and ownership trigger idempotently;
- enforces organization/church/member/branch ownership and active branch
  membership;
- contains no legacy public-schema dependency or destructive SQL.

The disposable catalog showed the existing table is empty and has canonical
foreign keys, hash/expiry/status constraints and an ownership trigger. No
database mutation was performed.

## Validation

`tests/v8-migration-contract.test.js` passed all 7 subtests, including
migration ordering, collision/drift behavior and additive SQL linting.
`git diff --check` passed.
