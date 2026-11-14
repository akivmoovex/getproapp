# Mutation test plan

The worktree was copied to a sandbox outside `/private/tmp/getpro-v13`. Each mutation was applied only to that copy, checked with `node --check`, and then the named test was run. The sandbox file was restored from the worktree before the next mutation. No database was opened.

| ID | Behavior changed in the copy | Test that should notice |
|---|---|---|
| M1 | A denied finance permission is treated as allowed | Payment denial before `connect` |
| M2 | Facility lookup no longer requires `organization_id` | Facility parameter assertion |
| M3 | An OTP at `expiresAt` is no longer rejected | Exact expiry assertion |
| M4 | Staff overlap returns null without querying | Collision assertion |
| M5 | The duplicate payment condition cannot match | The payment denial test, which stops earlier |
| M6 | An unknown encounter type returns `access_denied` | Encounter type assertion |

A syntax error or a missing module would have been recorded as invalid, not as detection. None of the six copies failed `node --check`.
