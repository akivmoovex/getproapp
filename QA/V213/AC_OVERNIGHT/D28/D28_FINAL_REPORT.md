# D28 final report

The overnight work is consolidated and the release is not ready.

`V13` HEAD is `b8f6b420d25e908de64ba292866c218c32edc30c`. D22's recorded G1 result remains 195 passed and 0 failed. The rerun at `2026-11-14T23:35:47+0200` executed 233, passed 233, failed 0, and skipped 0. Integration and browser suites were not part of that command.

Acceptance is 84 rows, 0 passed, 1 blocked (`SEC-01-02`), and 83 not run. AC-05 live denial, patient activation persistence, and appointment conflict persistence were not run. OTP production is not ready.

The dirty tree has 64 new test files and 5 modified test files. No unexpected path remains after the product, test, workflow, and report split. Secret patterns in the dirty set are a fixture rejection check and a URL redaction expression. Disabled workflows contain only a local Postgres URL.

`main`, `V12`, and both V9 checkouts are at the same commits recorded in D23. No database, production system, infrastructure file, or scheduler was changed. No commit and no push were made.

The QA file list is written for approval. It is not ready to commit on its own.
