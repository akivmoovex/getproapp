# GitHub push readiness

`QA_COMMIT_READY=NO`

`QA_PUSH_READY=NO`

`RELEASE_READY=NO`

The exact QA paths are in `QA_COMMIT_MANIFEST.md`. Sixty-one product paths are excluded, including `package.json`, the OTP module, and the modified BlessBoard and ActiveClinic routes. D30–D35 did not edit those product files and did not add a migration. They were already dirty from earlier stages and must stay unstaged.

Proposed message, not used:

```
Record V13 overnight QA evidence from D30 through D36.

Acceptance remains unexecuted and the design decisions stay pending.
```

Proposed command, not run:

```
git push -u origin V13
```

Use it only after a reviewed commit of the QA list alone. Do not use `git add -A`.

`main` is `44eafec486a18aeef2777bbcc9683e43f68ebe0d`. `V12` is `3214072de57bdc3f632aca77e1582a7f0b5c071a`. `ci.yml` is unchanged. The four V13 workflows stay `workflow_dispatch` only, with database and browser jobs held by `if: ${{ false }}`. Pushing `V13` would not start `ci.yml`.
