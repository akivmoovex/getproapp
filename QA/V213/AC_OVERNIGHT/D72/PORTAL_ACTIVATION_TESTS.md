# Portal activation tests

| Test | Assertion |
|---|---|
| Reset token for another clinic | `token_invalid`. No update |
| Expired token | `token_expired` before consume |
| Token already consumed | `token_already_used` before a second password write |
| Registration messages | The existing three sentences stay. No session cookie is issued |

Guest-booking replay remains the D64 and D38 behavior: a second owner is `link_conflict`, and the booking access token is not revoked. No portal row was stored.
