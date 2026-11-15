# CI failure diagnosis

Run `43654736449` is `.github/workflows/v13-ac-qa-regression.yml` at `c2cd146b01c6a9cfd92db65c2862320892c0888c`. The annotation is `You have an error in your yaml syntax on line 84`.

Run `43654737245` is `.github/workflows/v13-platform-qa-regression.yml` at the same SHA. The annotation is the same error on line 85.

Both lines are `run: echo "D16 hold: ..."`. The colon is inside a plain YAML scalar. Ruby reports `mapping values are not allowed in this context` at column 28. No job was created, so no test command, secret, or permission check ran.

The worktree now quotes those commands. Ruby loads both files. They still have no `push` trigger. `workflow_dispatch` is read from `main`, and these files are not on `main`. A push of the quote alone will not start Stage A. Dispatch was not performed.
