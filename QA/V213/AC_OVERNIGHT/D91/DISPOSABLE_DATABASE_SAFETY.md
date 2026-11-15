# Disposable database safety

G2 did not open a connection.

| Check | Result |
|---|---|
| `GETPRO_V13_ALLOW_DB_WRITES` | `0` |
| `GETPRO_V13_DB_STAGES_AUTHORIZED` | `0` |
| `DATABASE_URL` | Unset |
| `TEST_DATABASE_URL` | Unset |
| `E2E_DATABASE_URL` | Unset |
| `GETPRO_V13_CI_RUN_ID` | Unset |
| `DATABASE_IDENTITY_ENV` | Unset |
| Production host | None was configured |
| Shared database name | None was selected |

Both write flags must be `1` before a pool can open. The database name must match `^getpro_v13_(ci|bb_qa|int|e2e)_[a-z0-9]{6,32}$` and the host must be local. Those checks were not reached because the flags are off. No other database was substituted.
