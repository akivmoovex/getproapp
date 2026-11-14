# Implementation baseline

Branch `V13`. HEAD and `origin/V13` are `b8f6b420d25e908de64ba292866c218c32edc30c`. That matches the expected base. The index is empty. Porcelain is 93 paths. `main` is `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. `V12` is `3214072de57bdc3f632aca77e1582a7f0b5c071a`.

Write flags are unset or `0`. `DATABASE_URL` is unset. `db/migrations` has no dirty path. `ci.yml` is unchanged.

D19 remains in `docs/qa/V213_D19_*.md`. D30 through D36 remain under `QA/V213/AC_OVERNIGHT/`. This stage did not reset, clean, or overwrite them.

Fresh G1 evidence is the D35 run: 264 passed, 0 failed, 0 skipped, `2026-11-14T23:55:36+0200` to `2026-11-14T23:55:40+0200`, log `/tmp/d35-g1.log`. D22's 195 passes stay historical.

Acceptance: 84 mapped, 0 passed, 83 not run, 1 blocked (`SEC-01-02`). Packages are A 23, B 9, C 12, D 9, E 3, F 6, G 18, H 4. Eight `ACX` rows are pending and not run.

No design decision has an approval record. Work that can proceed is evidence and bug fixes to contracts the code already enforces. New clinical behavior cannot proceed.
