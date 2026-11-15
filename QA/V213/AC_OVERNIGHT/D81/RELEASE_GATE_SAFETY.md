# Release gate safety

| Gate | Status |
|---|---|
| G2 database jobs | `HELD` (`if: ${{ false }}`, write flags `"0"`) |
| G3 browser jobs | `HELD` |
| G4 operational jobs | `HELD` (no G4 job exists) |
| AC-05 live denial | `BLOCKED` |
| Production deployment | `NOT_AUTHORIZED` |
| Release ready | No |

The quote change does not add a deploy, a migration, a database reset, a hosted clinical call, or OTP delivery. `ci.yml` still lists `main`, `v2`, and `V7` only. `main` was not changed.
