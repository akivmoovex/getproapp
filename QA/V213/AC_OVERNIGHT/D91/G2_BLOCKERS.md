# G2 blockers

Execution stopped before a connection because every required condition is missing.

| Missing condition | State |
|---|---|
| Database write approval | `GETPRO_V13_ALLOW_DB_WRITES=0` |
| Stage authorization | `GETPRO_V13_DB_STAGES_AUTHORIZED=0` |
| Run id | Unset |
| Testing identity | Unset |
| Disposable URL | Unset |
| Migration approval | None |
| Bootstrap approval | None |

Merge lineage, retention, legal hold, slot capacity, and a transactional outbox are also unapproved features. They are not passing tests. The guards were not disabled.
