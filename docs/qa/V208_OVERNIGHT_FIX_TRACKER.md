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
| AC-03 | Mobile publishing requires real browser verification; existing shared editor contracts were not safely re-run in this batch | No code change; retain publish RBAC and draft/live separation | ActiveClinic mobile/editor publishing suites | BLOCKED | — |
| AC-04 | Gallery-image selection versus camera behavior requires native mobile picker verification | No code change; do not infer picker behavior from DOM alone | ActiveClinic media/mobile suites | BLOCKED | — |
| BB-06 | Mobile publishing requires real browser verification; existing shared editor contracts were not safely re-run in this batch | No code change; retain publish RBAC and draft/live separation | BlessBoard mobile/editor publishing suites | BLOCKED | — |
| BB-07 | Gallery-image selection versus camera behavior requires native mobile picker verification | No code change; do not infer picker behavior from DOM alone | BlessBoard media/mobile suites | BLOCKED | — |
| AC-05 | Shared recovery/token hardening and ActiveClinic testing delivery outbox already exist in V8 history | No new change; use mock/testing outbox only | ActiveClinic password-recovery and delivery tests | ALREADY_FIXED | 3287b52a / 62f60f7c |
| AC-12 | Invitation URL/environment parity and staff-invite coverage already exist in V8 history | No new change; do not claim inbox delivery | ActiveClinic staff-invite and environment-parity tests | ALREADY_FIXED | 10ddb165 |
| BB-05 | Existing BlessBoard invitation/password-reset suites cover token, linking, role, and tenant paths | No new change; mock delivery only; inbox delivery unverified | BlessBoard invitation and recovery suites | ALREADY_FIXED | — |
| AC-06 | ActiveClinic public contact ownership/routing fixes already exist in V8 history | No new change; reuse tenant-scoped contact service and mocked delivery | `activeclinic-public-website.test.js`, contact security suite | ALREADY_FIXED | 9a0c3045 |
| AC-07 | Public inquiry persistence, CSRF, duplicate handling, and success response already covered by prior contact fixes | No new change | `activeclinic-public-website.test.js`, `v2-05-contact-flow-security.test.js` | ALREADY_FIXED | 0c873840 / 9a0c3045 |
| AC-11 | Booking and clinic-inquiry route ownership/duplicate handling already fixed in V8 | No new change | `activeclinic-public-booking.test.js` and booking linkage suites | ALREADY_FIXED | 0c873840 / c5ce63fc |
| BB-04 | Existing shared contact security suite covers church recipient and tenant isolation paths | No new change; mocked notification delivery only | `v2-05-contact-flow-security.test.js` and BB contact tests | ALREADY_FIXED | facf93bc |

No application files were modified. Mobile native-picker behavior was not
claimed from static inspection, and no browser verification was run in this
batch. No assertions were weakened and no database writes, migrations, resets,
or external-service calls were made.
