# Workflow fix manifest

Two tracked files differ from `c2cd146b01c6a9cfd92db65c2862320892c0888c`. Nothing is staged.

| File | Change |
|---|---|
| `.github/workflows/v13-ac-qa-regression.yml` | The three held-job `echo` commands are YAML-quoted. The shell text is unchanged |
| `.github/workflows/v13-platform-qa-regression.yml` | The three held-job `echo` commands are YAML-quoted. The shell text is unchanged |

`npm run test:v13:ac` and `npm run test:v13:platform` are unchanged. Both write flags stay `"0"`. The database, browser, and authenticated-session jobs stay `if: ${{ false }}`. No `push`, `pull_request`, or `schedule` trigger was added. No application source file was edited.

A later commit of only these two files is the proposed workflow commit. This stage did not commit it.
