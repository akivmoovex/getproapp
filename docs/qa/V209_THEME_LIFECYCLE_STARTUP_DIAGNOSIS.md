# V2.09 Theme Lifecycle Startup Diagnosis

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
MARKER_POSITION=MARKER_MODULE_START is before every import; MARKER_IMPORTS_COMPLETE is after all imports
MODULE_IMPORT_STATUS=Not complete within the bounded run; direct imports eventually completed individually but are very slow
LAST_SUCCESSFUL_IMPORT=In the lifecycle direct sequence: submitClinicRegistrationService; in the next server sequence: express
FIRST_BLOCKING_IMPORT=No exact require hang proven; morgan was the next slow import in the server dependency sequence
TOP_LEVEL_INITIALIZATION=No top-level application initialization reached; declarations follow imports
NODE_TEST_REGISTRATION=Not reached in the bounded lifecycle run
BEFORE_HOOK_REACHED=NO
DATABASE_ACCESS_ATTEMPTED=NO
ROOT_CAUSE=UNKNOWN; measured behavior is cumulative module-load latency exceeding the 30-second observation window, not a proven blocking operation
C8_SCHEMA_TIMEOUT_RELATED=Possibly related to the same startup/module-load latency, but not proven
APPLICATION_CODE_CHANGED=NO
PRODUCTION_MUTATION=NO
FINAL=V209_THEME_LIFECYCLE_STARTUP_DIAGNOSIS_COMPLETE
```

## Evidence

- Local and origin `V9` both resolve to
  `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`.
- `NODE_OPTIONS` is unset and no preload/loader hook was present.
- The lifecycle marker immediately before imports printed.
- The lifecycle marker after imports did not print within the bounded run.
- A direct dependency sequence reached and completed
  `submitClinicRegistrationService`; therefore its earlier suspected import
  failure was not reproduced.
- A separate direct sequence reached `express` and then spent the remaining
  bounded window in `morgan`. A standalone `require("express")` completed in
  approximately 10 seconds and a standalone `require("morgan")` completed in
  approximately 7 seconds.
- No database connection, reset, migration, hook, or test body was reached.

This evidence does not justify naming `morgan` as a permanent root cause:
the standalone require completed, and the observed behavior is slow cumulative
startup rather than a reproducible non-returning require. No application code
or tracked test file was changed.

