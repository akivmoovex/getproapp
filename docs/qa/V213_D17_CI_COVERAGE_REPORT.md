# V2.13 D17 CI coverage

Workflows remain `workflow_dispatch` only. Stages that write a database or start Playwright stay `if: false`. No workflow was dispatched.

| Area | Stage A discovery | Nonmutating Stage D | Gated stages |
|---|---|---|---|
| BlessBoard | `v13-bb-qa-regression.yml` and `v13-bb-bug-regressions.yml` run `tests/v13/unit/*.test.js` and `tests/v13/quality/d17-mutation-probes.test.js` | `npm run test:v13:d17` job added; not dispatched | B and C remain `if: false` |
| ActiveClinic | `npm run test:v13:ac` includes `tests/v13/unit/d17-ac-behavior.test.js` | Same command in a nonmutating job; not dispatched | B, C, and the live security job remain `if: false` |
| Shared platform | `npm run test:v13:platform` includes the OTP, HTTP, and mutation files | Same command in a nonmutating job; not dispatched | B, C, and the live security job remain `if: false` |

Local Stage A equivalent: `npm run test:v13:contract` passed 144 tests, and the mutation file passed 3. Gated integration records: 11 `NOT_RUN`. Those records are not passes of persistence.

`NOT_RUN` is not treated as `PASS`.
