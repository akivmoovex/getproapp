# GitHub push readiness

`QA_COMMIT_READY=NO`

`QA_PUSH_READY=NO`

The exact QA paths are in `QA_COMMIT_MANIFEST.md`. Product files stay out of that list: 47 modified paths, including `package.json`, and 14 untracked source files. The 14 are the OTP module and the two BlessBoard public-contact modules.

A commit of the QA list alone would not run. The new tests import `src/platform/otp/` and the modified BlessBoard and ActiveClinic routes. `package.json` only adds ten test-script lines, and it is still excluded because it is a product file.

Proposed message, not used:

```
Record the V13 overnight QA evidence from D19 through D28.

Acceptance remains unexecuted and the release gates stay closed.
```

Proposed command, not run:

```
git push -u origin V13
```

Run that only after a reviewed commit. Do not use `git add -A`. That would stage the product repairs and the OTP module.

`origin/V13` is still `b8f6b420d25e908de64ba292866c218c32edc30c`. Pushing this branch would not start `ci.yml`, which triggers on `main`, `v2`, and `V7` only. The new V13 workflows do not run on push.
