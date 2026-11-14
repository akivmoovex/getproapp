# CI gap closure

The workflow file was not edited. Stage B, Stage C, and authenticated Stage D still have `if: ${{ false }}`. Neither write flag was changed. `enable_db_stages` is still not referenced by a job `if`.

`npm run test:v13:ac` still runs five files and passed 14. That is the command Stage A and non-mutating Stage D use. It does not include the later unit and contract files, integration tests, or Playwright. A local G1 run is not a CI job.

Required release rows that are `NOT_RUN` or any value other than `PASS` now keep `evaluateReleaseReadiness` blocked. The BlessBoard report written under `/tmp/d67-qa-report` concluded `RELEASE_BLOCKED` with 16 required rows not passed. That report is not ActiveClinic acceptance evidence.

## Unapplied patch

These edits stay in this note.

1. Replace both `npm run test:v13:ac` steps with the local G1 file list. Do not add `tests/v13/integration` or Playwright.
2. Require `target_sha` to be 40 hex characters and equal to `git rev-parse HEAD`. Do not fall back to `github.ref`.
3. Upload a file that contains the checkout SHA, the run id, and the test exit code, with `if: always()`. Do not ignore a missing file.
4. Leave the three held jobs, both write flags, and the absence of migrate and deploy as they are.

## Gaps that remain

| Gap | Why it was not changed here |
|---|---|
| Stage A runs 14 cases | The workflow and the npm script were left in place |
| SHA is optional | Checkout still uses `inputs.target_sha \|\| github.ref` |
| No ActiveClinic artifact | No upload step was added |
| Stage A does not check the database guard | The guard was run locally. The job does not call it |
