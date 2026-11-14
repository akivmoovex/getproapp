# Surviving mutations

M5 survived the first run. Changing `dupCheck.rows.length > 0` to `dupCheck.rows.length < 0` left `denies payment collection` green. That test returns when the product row is missing, so it never reaches the duplicate branch. The SQL text was still present, so an older source search for `idempotency_key` would also have stayed green.

M1, M2, M3, M4, and M6 failed in the test body. M4 failed when the test read `kind` from the null collision. That is the overlap result disappearing, not a failure while loading the file.

No mutation was left in the worktree.
