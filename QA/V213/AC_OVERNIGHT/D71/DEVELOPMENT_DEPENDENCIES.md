# Development dependencies

Existing code already covers organization predicates on the clinical, portal, pharmacy, diagnostics, and billing paths that D46–D66 changed. Those files stay in the worktree. They are not a new package.

| Dependency | Rule |
|---|---|
| Routes | Do not add `/api/v1`. AC-05 stays on `GET /admin` and the two test-database routes, behind `requireApex` and `requirePlatformAdmin` |
| Services | Extend a service only to evidence a check it already has, or after the decision in the approval boundary |
| Repositories | Reads and updates keep `organization_id`. Do not add `result_id`, `slot_capacity`, or `FOR UPDATE` on appointments |
| Views | No new clinical screen until D29-18 names it |
| Permissions | Do not widen the role catalogue. D21-01 is open |
| Migrations | None. The foundation order, when a later run is authorized, is `platform`, `blessboard`, `activeclinic`, `getpro`, `ngo` on a run-owned database |
| Fixtures | `applyActiveClinicFixtures` throws `V13_FIXTURE_HOLD`. The provisioner mints `ac-hqa-` keys and does not insert the AC-05 users |
| Teardown | Drop only that run-owned database. There is no ActiveClinic cleanup inside `runAcAuth` |

Package A evidence depends on the write flags and a guarded local URL. Packages G and H depend on decisions, not on package A.
