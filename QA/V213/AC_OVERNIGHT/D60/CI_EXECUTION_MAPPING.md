# CI execution mapping

No job was dispatched. Stage B and Stage C of `v13-ac-qa-regression.yml` are `if: ${{ false }}`.

| Evidence | Future job | Command that would run | What it can prove today |
|---|---|---|---|
| G2 persistence | `stage-b-integration` | Not present. The job only echoes a hold | Nothing. The 13 integration files are not started |
| G3 browser | `stage-c-browser` | Not present. The job only echoes a hold | Nothing. Playwright is not started |
| AC-05 live denial | `stage-d-security` | Not present | Nothing |
| In-process G1 | Stage A | `npm run test:v13:ac` | 14 cases. Not these 84 outcomes |

When a later approval opens a disposable database, the integration command is `node --test tests/v13/integration/*.test.js` with both write flags, `NODE_ENV=test`, `DATABASE_IDENTITY_ENV=testing`, `GETPRO_TEST_DB=1`, and a run-owned URL. The browser command is the ActiveClinic Playwright spec with `GETPRO_V13_BROWSER_AUTHORIZED=1` and the same database rules. Those commands are not in the held jobs. Adding them is a workflow change and was not made.
