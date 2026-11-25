# G150 baseline

Branch `V13`. Local HEAD and `origin/V13` at the start of this cycle were `3e695871c5801a2225c93f574abad5143b494473`. The prompt's last confirmed SHA `155ada725926d83468fe47e82b87757d20adb097` is the parent handoff, already contained in this HEAD. `main` is `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. `origin/main` is `a802fc3fd503733767011798d3f90bf83058c7dd`. Neither main ref was moved.

Worktree at start: clean except untracked `bb-lifecycle.log` and `docs/qa/V2131_GAP_G08_FINAL_REPORT.md`. Those files stayed untracked. No reset, clean, rebase, or force-push.

## Versions

BlessBoard and ActiveClinic product version is `2.13.2` in `src/platform/build/applicationBuildInfo.js` (`VERSION_BASE_V8` and `PRODUCT_VERSION_V8`). About fallbacks stay `2.13.2`. This cycle did not bump the version.

## Environment

| Item | Value |
| --- | --- |
| SOURCE_SHA | `3e695871c5801a2225c93f574abad5143b494473` |
| ENVIRONMENT | local disposable QA |
| DATABASE | `getpro_v13_e2e_g78d2301` at `127.0.0.1:55432` |
| APPLICATION_BUILD | `2.13.2` |
| Hosted health SHA | previously observed `155ada725926` with branch label `V11` from `GETPRO_GIT_BRANCH` |
| Hosted deploy this cycle | not performed |

## Prior executed baseline

The G146 pair, before the G147 build-identity test, was safe 571/569/0/2, HTTP 35/32/3, Playwright 49/49 (ActiveClinic 26, BlessBoard 23). After G147 the safe suite was 572/570/0/2. HTTP and Playwright were not re-run in G147–G149.

Known failing gates, left failing:

- D14C OTP persistence
- D16 platform OTP persistence
- D25 slot capacity

D25 same-staff overlap was already a passing two-client proof. Those three failing tests were not edited to go green.
