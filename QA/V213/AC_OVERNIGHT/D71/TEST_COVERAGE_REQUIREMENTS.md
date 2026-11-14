# Test coverage requirements

| Level | What must be true | CI job | Now |
|---|---|---|---|
| Unit and contract | Positive, negative, and failure paths for behavior that already exists. A mock pass is not stored evidence | Local G1. Not Stage A | G1 passed 344. Stage A runs 14 |
| Integration | One stored row, a denied second tenant, and a rollback that leaves no row | `v13-ac-qa-regression` Stage B | `if: false`. `NOT_RUN` |
| Browser | The seven ActiveClinic journeys, including the AC-05 403 | Stage C | `if: false`. `hold()` throws |
| Security | Lower-privilege session gets HTTP 403 on both test-database routes. A redirect to `/login` fails the case | Authenticated Stage D | `if: false` |
| Concurrency | Two connections and one stored appointment, only after D21-05 names the rule | Stage B | The gated test throws if the gate opens |
| G4 | Not defined | None | `ABSENT` |

A skipped test must remain visible as skipped. It must not be counted as a pass. Release certification needs all 84 cases with database evidence where required, plus G2, G3, and a defined G4. None of that evidence exists.
