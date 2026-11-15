# CI root cause

The two runs failed because GitHub rejected the workflow file before it created a job.

The ActiveClinic file line 84 and the platform file line 85 are `run: echo "D16 hold: ..."`. The colon after `hold` is unquoted YAML. The same pattern is on the later held-job lines, which the parser did not reach. Quoting each command as a YAML string removes the syntax error.

This is not a missing secret, a permissions block, a reusable-workflow reference, or an expression error in `if: ${{ false }}`. Those `if` lines parse. The zero-second duration matches a file that never started a runner, and the annotation names the line.

`workflow_dispatch` is a separate registration rule. GitHub reads that trigger from the default branch, which is `main`. These files are on `V13` only. Dispatch returned HTTP 422 for that reason. Repairing the YAML does not put the file on `main`, and this stage does not change `main`.
