# V2.12 ActiveClinic Reusable Fixture Bootstrap

Implemented in the writable QA workspace only:

`/private/tmp/getpro-v12-ac-qa-workspace/db/scripts/activeclinic-acceptance-bootstrap.js`

The bootstrap composes the existing guarded clinic audit and QA role seed services, verifies the testing database identity, requires the approved database URL, and fails closed for unsupported acceptance prerequisites. It does not insert roles directly, rewrite tenant IDs, mint portal tokens, or reset data.

Execution:

- QA image rebuilt: `v212-ac-harness:2.12`
- Audit result: PASS
- Database identity: `moovex-platform-v7`, testing
- Clinics audited: `activeclinic-demo`, `julflona-clinic`
- Platform Super Admin fixture: BLOCKED — no supported shared-platform fixture service exposed by the ActiveClinic seed contract.
- Clinic-B staff/patient/appointment fixture: BLOCKED — QA role seed is scoped to `activeclinic-demo`.
- Portal token fixture: BLOCKED — no supported isolated booking-request/token bootstrap exposed.

The original V12 worktree and release candidate were not modified by the bootstrap implementation.
