# CI failure propagation

A command that Stage A actually runs can fail the job. The ActiveClinic workflow has no `continue-on-error`.

Checked locally, without dispatch:

| Probe | Exit |
|---|---|
| `npm run d59-missing-script-probe` | 1 |
| `node --test` with one failing assertion | 1, and the summary says `fail 1` |
| `node --test` with one `{ skip: "not authorized" }` | 0, and the summary says `skipped 1` |

A missing npm script does not pass. A failed assertion does not pass. A skip is printed in the `node --test` summary. The ActiveClinic Stage A command has no skipped test. The three held jobs are skipped by `if: ${{ false }}`, which GitHub shows as a skipped job rather than a passed test.

The BlessBoard Stage A step uses `set +e`, saves the exit code, and then `exit "$CODE"` when the code is not 0. That still fails the job. It does not turn a test failure into a pass.

A failure in `d57-behavioral-strengthening.test.js` cannot fail the ActiveClinic job, because that file is not in `npm run test:v13:ac`.
