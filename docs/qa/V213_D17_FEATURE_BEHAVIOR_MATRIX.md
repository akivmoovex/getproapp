# V2.13 D17 feature behavior matrix

Branch `V13`, HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. Query doubles are labeled as such. They are not database persistence. Browser and database-writing suites were not executed.

| Feature | Behavior exercised | Result | Untested reason |
|---|---|---|---|
| BB-01 homepage sections | text, image, story, and CTA edits; section keys stay distinct; unsafe CTA URL rejected; missing permission rejected; visible text is escaped with `<%= _value %>` | PASS | Draft and publish persistence, cross-tenant save |
| BB-02 announcements | Published rows stay public; drafts and the other church are hidden; foreign media is dropped; a member cannot publish | PASS | Real upload bytes and database visibility |
| BB-03 events | End-before-start, missing title, and HTML title rejected by the service and the branch form validator | PASS | POST `/branch/events` against a database |
| BB-04 sermons | Valid sermon fields, impossible date, and non-HTTPS media rejected by `buildSermonFields` | PARTIAL | Branch sermon route handler is not exported and was not invoked |
| BB-05 CSRF | Express form issues one token; missing and foreign tokens return 403; the matching token returns 201 | PASS | HQ member row persistence and hosted retest |
| BB-06 activation | Short password, active OTP hold, expired token, and missing member/church row rejected | PASS | Password setup persistence and member login |
| BB-24 directory | Two churches; posted `church_id` ignored; missing scope writes nothing | PASS | Inbox read against a database |
| INV-01 staff invitation | Existing unit contracts remain. First authenticated login was not executed | BLOCKED | Session persistence requires the held database path |
| AC staff role scope | Wrong clinic, cashier organisation scope, receptionist without a facility, and organisation admin at facility scope denied before insert | PASS | Live authenticated AC-05 denial |
| AC appointments | Invalid identifier rejected before a query; unknown appointment is not cancelled | PARTIAL | Conflict detection and status persistence |
| AC org switch | `/app/select-organization` now passes `activeclinic.staff_login` into the session gate | PASS | Authenticated browser switch |
| Shared OTP | Challenge replacement, worker isolation, purpose separation, Zambia numbers, delivery failure without the code | PASS | Distributed store, real provider, production activation |
| Shared CSRF and version | Version 2.13 for both products; historical 2.12 notes remain; logout headers and deployment counts | PASS | Hosted About pages |

Machine-readable rows: `docs/qa/V213_D17_FEATURE_BEHAVIOR_MATRIX.json`.
