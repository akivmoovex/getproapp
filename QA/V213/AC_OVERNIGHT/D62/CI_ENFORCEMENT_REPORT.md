# CI enforcement report

ActiveClinic Stage A runs `npm run test:v13:ac` and has no `continue-on-error`. A failure in that command fails the job. A missing npm script exits 1. The command is 14 cases. Failures in the other unit and contract files cannot fail this job.

Stage B, Stage C, and authenticated Stage D are `if: ${{ false }}`. They disclose a skipped job, not a passed test. `enable_db_stages` does not start them. Checkout falls back to the branch ref when no SHA is supplied. The workflow uploads no artifact.

`ci.yml` does not run on `V13`. No workflow was dispatched.
