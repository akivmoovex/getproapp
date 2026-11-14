# D20 baseline verification

Read-only inspection of `/private/tmp/getpro-v13`. No fetch, checkout, reset, merge, commit, or push.

| Check | Result |
|---|---|
| Branch | `V13` |
| HEAD | `b8f6b420d25e908de64ba292866c218c32edc30c` |
| `refs/heads/V13` | same SHA |
| `origin/V13` | same SHA |
| `V13...origin/V13` | `0 0` |
| `V12` and `origin/V12` | `3214072de57bdc3f632aca77e1582a7f0b5c071a` |
| Commits from V12 to V13 | 1: `V2.13: initialize BB and AC release version` |
| Working tree | 52 modified, 40 untracked, 92 short-status lines |

Committed `V13` matches `origin/V13`. The working tree does not. Those uncommitted files are the D03–D19 edits already in this checkout. They were not selected as a different baseline.

`1c79bd77bd76a968fe69aff678e0380e2a5be463` exists and is an ancestor of `V12`. It is the SHA named by the OTP specification. It is not the tip of branch `V12` in this worktree. The V9 workspace inventory used that older SHA and said V13 was 43 commits ahead of it. From `1c79bd77` to this HEAD, ActiveClinic still has only the about-page version edit in committed history.

The Cursor workspace at `getpro` is branch `V9` at `037cbaa3c26453dbea0962a7a82c889c5d550007`. It is not this baseline. The 84-row traceability CSV lives there, under `QA/V213/AC_OVERNIGHT/STAGE_01/`.
