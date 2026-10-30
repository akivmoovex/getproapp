# V2.12 Backup and Restore Verification

## Source database

- Database: `getpro_v212_reset_qa_01`
- Host: local Unix socket
- PostgreSQL client/server: `pg_dump` 16.2 / PostgreSQL 16.9
- Database identity: `moovex-platform-v7`
- Environment code: `testing`
- Dump format: PostgreSQL custom format
- Destination: `/tmp`, outside public application directories

## Procedure

1. Confirmed the source database identity and local server before dumping.
2. Created a custom-format `pg_dump` without owner or privilege restoration.
3. Verified the dump catalog with `pg_restore --list`.
4. Created new database `getpro_v212_reset_qa_restore_02`.
5. Restored the dump into the new database.
6. Compared representative counts and identity values.

## Evidence

| Check | Source | Restored |
|---|---:|---:|
| Synthetic V2.12 organizations | 4 | 4 |
| `platform.schema_migrations` rows | 232 | 232 |
| `platform.database_identity` rows | 1 | 1 |

The restore was performed into a separate database and never over the source. No production or hosted database was contacted.

## Limitations

This proves recoverability for the disposable schema and current synthetic records. A future reset release gate must additionally restore and verify representative application records for both products, essential administrator identities, media references, audit records, and any external storage objects.
