# D21 baseline safety

Inspection time: 2026-11-14T23:11:24+0200. Read-only. No fetch, checkout, reset, stash, clean, commit, merge, or push.

| Check | Result |
|---|---|
| V13 worktree | `/private/tmp/getpro-v13` |
| Branch | `V13` |
| HEAD | `b8f6b420d25e908de64ba292866c218c32edc30c` |
| `origin/V13` | same SHA, left-right count `0 0` |
| Working tree | 52 modified, 41 untracked, 93 porcelain lines |
| Other worktrees | `/Users/akivsolomon/Development/getproapp` on `V9`; `/Users/akivsolomon/Development/getpro-v12` on `V12` |
| Cursor workspace | `/Users/akivsolomon/Documents/DocumentsAkiv/Akiv/Dev/CursorProjects/getpro`, branch `V9`, SHA `037cbaa3c26453dbea0962a7a82c889c5d550007`, 50 dirty paths |
| Node / npm in the V13 worktree | v22.23.1 / 10.9.8 |
| `node_modules` and lockfile | Present |
| `DATABASE_URL` | Unset |
| DB write flags and browser flag | Unset |

The only V13 worktree is dirty. No clean isolated V13 checkout exists. Fresh G1 commands were not started. Tests were not run from the dirty V9 tree, and no file was written there.

Reports for this stage are written only under the existing V13 worktree path `QA/V213/AC_OVERNIGHT/D21/`. That directory is QA text. It does not change product code.

Source baseline for acceptance classification remains `origin/V13`. Uncommitted D03–D20 files stay in the worktree and are not a second baseline.
