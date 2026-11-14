# Mutation effectiveness

Six sandbox mutations were tried. The worktree files were not changed.

| Mutation | Result |
|---|---|
| Denied finance permission treated as allowed | Detected |
| Facility lookup without the organization | Detected |
| OTP accepted at the expiry instant | Detected |
| Staff overlap returned null | Detected |
| Unknown encounter type returned `access_denied` | Detected |
| Duplicate payment condition inverted | Survived the behavioral payment test. A later source guard detects that text change. It does not execute the duplicate return |

Effectiveness is partial. The duplicate-payment path can still be wrong while the behavioral test stays green. No mutation was left in the worktree.
