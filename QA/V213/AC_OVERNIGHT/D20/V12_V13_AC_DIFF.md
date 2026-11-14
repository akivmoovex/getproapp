# V12 versus V13 ActiveClinic diff

Compared in `/private/tmp/getpro-v13`. V12 is `3214072de57bdc3f632aca77e1582a7f0b5c071a`. V13 is `b8f6b420d25e908de64ba292866c218c32edc30c`.

## Committed product diff

`git diff V12...HEAD` for ActiveClinic application code:

- `views/activeclinic/public/about.ejs` — version text only, 4 lines each way.
- No committed change under `src/activeclinic`, `public/activeclinic`, or `db/migrations/activeclinic`.

The same about-page file is the only ActiveClinic path that changes from `1c79bd77` to HEAD.

Committed shared platform:

- `src/platform/build/applicationBuildInfo.js`
- `src/platform/release-notes/releaseNotesCatalog.js`

No committed workflow or `package.json` change in that range. Version tests changed with the release text.

Committed V13 does not add an ActiveClinic clinical feature, OTP module, security control, QA suite, browser suite, fixture, or CI workflow.

## Uncommitted working tree

This is not a V12-to-V13 commit. It is local work on top of HEAD.

ActiveClinic, 55 added lines, no deletions, in six files:

- `activeClinicAppRoutes.js`, `activeClinicAuthRoutes.js`, `activeClinicPublicRoutes.js` pass an `otpWorkflow` into the existing session call.
- `activeClinicLifecycleRoutes.js` and `activeClinicPatientPortalRoutes.js` call `holdIfOtpRequired`.
- `activeClinicAuthorizationService.js` does the same before a role assignment.

Those calls do not add a clinical workflow. Production OTP stays blocked, so they do not change the current login result.

Shared platform working tree:

- New untracked `src/platform/otp/`.
- `sharedSessionSecurity.js` and `v5FoundationServer.js` session-gate edits.
- `editableFieldSchema.js` is a BlessBoard homepage editor change, not an ActiveClinic feature.

Also uncommitted, and not ActiveClinic product features: BlessBoard route and view edits, four `workflow_dispatch` V13 QA workflows, `tests/v13`, `tests/e2e/v13`, and the D16–D19 QA reports.

Test files and CI YAML are QA configuration. They are not product-feature implementation.
