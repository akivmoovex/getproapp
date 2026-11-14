# CI coverage verification

Stage A is narrow. `npm run test:v13:ac` runs five files. The D79 G1 list of 399 tests is not that command. A failure of the five files fails the Stage A job. A failure in the other G1 files does not, because they are not in the job.

Non-mutating Stage D runs the same five files. Stage B, Stage C, and authenticated Stage D are `if: ${{ false }}`. There are three held jobs. `enable_db_stages` is an input and is not a job condition. The workflow is `workflow_dispatch` only. Both write flags in the workflow env are `"0"`. `target_sha` is optional. There is no `upload-artifact` step.

CI coverage is not sufficient. The G2 and G3 gates stay held. No G4 job exists.
