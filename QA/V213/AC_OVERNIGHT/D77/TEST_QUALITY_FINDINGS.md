# Test quality findings

A service assertion on a fake database is useful and incomplete. It can show that a denial returns before an insert. It cannot show that a second database session lost a race, or that a row survived commit.

| Finding | Status |
|---|---|
| Unconditional `assert.ok(true)` in the D72–D77 files | Not found |
| D77 finalization tests | They assert `not_found` or `not_draft`, the absence of `UPDATE`, and that the body is not in the denial |
| D65 overlap | Two checks can both pass before a row exists. That is an open race, not protection |
| Mock-only payment and consent tests | Not a database pass |
| AC-05 | The in-process contract is not a live 403 |
| Stage A | Narrow. Failure of its five files fails the job. Failure of a D64–D77 test does not, because those files are not in the job |
| Held jobs | They stay `if: false`, so a skipped gate does not fail CI |
| Release helper | A required skip or `NOT_RUN` is not treated as `PASS` |
| Artifact | SHA, environment, and run id are not uploaded |

Quality remains `NOT_CERTIFIED`. Test count 399 is not a coverage certificate.
