# V2.09 Module Loading Benchmark

Branch SHA: `6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4`

```text
BRANCH_SHA=6c88ca7c5d9bfc4236ae908f235d3d4aa664e8e4
MODULES_MEASURED=22
TOTAL_IMPORT_TIME_MS=114977
SLOWEST_IMPORT_1=src/activeclinic/http/activeClinicFoundationServer.js: 65139 ms
SLOWEST_IMPORT_2=src/platform/http/v5FoundationServer.js: 49617 ms
SLOWEST_IMPORT_3=supertest: 107 ms
SLOWEST_IMPORT_4=src/activeclinic/services/submitClinicRegistrationService.js: 72 ms
SLOWEST_IMPORT_5=tests/helpers/foundationDb.js: 20 ms
ALL_IMPORTS_COMPLETE=YES
TEST_REGISTRATION_REACHED=YES
DATABASE_ACCESS=NO
STARTUP_CLASSIFICATION=SLOW_FINITE
NEXT_ACTION=Allow at least 115 seconds for cold module loading before classifying lifecycle startup as hung; investigate the two slow server imports separately
FINAL=V209_MODULE_LOADING_BENCHMARK_COMPLETE
```

The benchmark used a fresh Node process, the lifecycle dependency order, stderr
progress checkpoints every 10 seconds, and no database URL or test hooks.
All 22 imports completed within the 120-second observation window. The two
slow server imports contributed 114756 ms, approximately 99.8% of total
measured import time.

A second fresh process loaded the same imports and successfully registered and
completed a trivial `node:test` suite without executing any `before()` hook.
No application, test, dependency, or database files were changed.

