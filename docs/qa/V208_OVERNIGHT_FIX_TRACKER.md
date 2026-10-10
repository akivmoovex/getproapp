# V2.08 Overnight Fix Tracker

```text
BRANCH=V8
HEAD_SHA=8f21d6f12777a04e385237b3acb0005bd7af8b51
TEST_DATABASE=not accessed in this batch
TEST_HARNESS=Node test runner; focused AC suite exceeded bounded execution window before producing results
EXISTING_FIXES=V8 history contains prior ActiveClinic registration, patient-linkage, booking, and release-regression fixes
ENVIRONMENT_BLOCKERS=Focused AC tests stalled during startup/import or harness initialization; no runtime defect was reproduced
```

| ID | Root Cause | Action | Test | Status | SHA |
|---|---|---|---|---|---|
| AC-01 | Existing implementation requires verification against the focused website/theme lifecycle suite | No runtime change; preserve existing theme lifecycle and tenant isolation contracts | `activeclinic-clinic-website-availability.test.js` plus related theme suites | BLOCKED | — |
| AC-02 | Existing patient registration implementation requires verification against the focused registration/auth suite | No runtime change; preserve CSRF, identity, duplicate, and tenant guards | `activeclinic-mf08-patient-registration.test.js` and related registration suites | BLOCKED | — |
| BB-01 | Branch capacity is plan-derived; a manual branch-count field is not authorized by the stated contract | No code change; require a product decision before adding non-plan capacity behavior | Branch provisioning, registry, edit, entitlement, and limit suites | REQUIREMENT_DECISION | — |
| BB-02 | Announcement scope and attachment isolation require the focused suite to complete before a defect can be established | No runtime change; preserve church/branch scope and RBAC guards | `v8-bb-announcements.test.js`, branch announcement, attachment, and scope suites | BLOCKED | — |

No application files were modified. The focused BB suites were started once and
stalled before producing pass/fail output; no assertions were weakened and no
database writes, migrations, resets, or external-service calls were made.
