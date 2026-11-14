# Git status audit

Inspection of `/private/tmp/getpro-v13` on 2026-11-14. No fetch, checkout, commit, merge, or push.

| Ref | SHA |
|---|---|
| Branch | `V13` |
| HEAD | `b8f6b420d25e908de64ba292866c218c32edc30c` |
| `refs/heads/V13` | same SHA |
| `origin/V13` | same SHA |
| `V13...origin/V13` | `0 0` |
| `main` | `44eafec486a18aeef2777bbcc9683e43f68ebe0d` |
| `V12` and `origin/V12` | `3214072de57bdc3f632aca77e1582a7f0b5c071a` |

Other checkouts were read and not written:

| Checkout | Branch | SHA | Porcelain lines |
|---|---|---|---|
| `/Users/akivsolomon/Development/getproapp` | `V9` | `a60b907bf8d576fb4fed056d77437ae033affe5e` | registered worktree |
| Cursor workspace `getpro` | `V9` | `037cbaa3c26453dbea0962a7a82c889c5d550007` | 50, pre-existing |
| `/Users/akivsolomon/Development/getpro-v12` | `V12` | `3214072de57bdc3f632aca77e1582a7f0b5c071a` | 11, pre-existing |

The V13 worktree had 52 modified tracked files and 124 untracked files, 176 paths, before these D23 reports. Adding the six D23 reports makes 182 paths. None of that is staged.

`ci.yml` still limits push and pull-request runs to `main`, `v2`, and `V7`. The four V13 workflow files are `workflow_dispatch` only, with database and browser jobs on `if: ${{ false }}`.
