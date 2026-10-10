# V2.08 fixed-issue automated regression matrix

The audit below maps the fixed QA issues to existing behavioral tests. `FULL`
means the test asserts the relevant result, isolation, or rejection behavior;
route/import-only checks are not counted.

| ISSUE | TEST_ID | PRODUCT | SCENARIO | EXISTING_TEST | COVERAGE_BEFORE | ACTION | FINAL_TEST_FILE | FINAL_STATUS |
|---|---|---|---|---|---|---|---|---|
| Leadership multi-item publish | BB-REG-LEADERSHIP-01 | BB | Three leaders remain after independent edits | v2 leadership data-loss | FULL | retain | tests/v2-bb-leadership-data-loss.test.js | FULL |
| Leadership multi-item publish | BB-REG-LEADERSHIP-02 | BB | Unique names/text stay paired to entity keys | v2 leadership data-loss | FULL | retain | tests/v2-bb-leadership-data-loss.test.js | FULL |
| Leadership multi-item publish | BB-REG-LEADERSHIP-03 | BB | New collection members do not overwrite siblings | v2 leadership section management | FULL | retain | tests/v2-bb-leadership-section-management.test.js | FULL |
| Announcement audience visibility | BB-REG-ANN-01..08 | BB | Scope, publication state, tenant/product boundaries | V8 announcements | FULL | retain | tests/v8-shared-announcements.test.js | FULL |
| Image/media handling | SHARED-REG-MEDIA-01..08 | BB/AC | Type, size, encoding, storage and namespace validation | shared media parity/type tests | FULL | retain | tests/v2-shared-media-upload-parity.test.js; tests/v2-shared-media-type-conversion.test.js | FULL |
| BB mobile editor | BB-REG-MOBILE-01..06 | BB | 390/360 editor controls and gallery selection | unified mobile editor | FULL | retain | tests/v7-website-mobile-editor.test.js; tests/v7-bb-mobile-editor-pointer.test.js | FULL |
| Theme/colour save and publish | AC-REG-THEME-01..06 | AC | Draft/live theme separation and public resolution | shared theme infrastructure and website lifecycle | FULL | retain | tests/v2-01-shared-theme-infra.test.js; tests/v7-website-draft-live-integrity.test.js | FULL |
| Patient registration | AC-REG-PATIENT-01..07 | AC | Create, validate, link, CSRF and scope | MF08 and registration idempotency | FULL | retain | tests/activeclinic-mf08-patient-registration.test.js; tests/activeclinic-registration-identity-idempotency.test.js | FULL |
| Guest booking/linkage | AC-REG-BOOKING-01..08 | AC | 400 regression, guest/new/existing linkage and isolation | booking linkage | FULL | retain | tests/activeclinic-booking-patient-linkage.test.js | FULL |
| Clinic contact/inquiry | AC-REG-CONTACT-01..07 | AC | Public clinic resolution, validation and scope | public forms and AC public-site contracts | FULL | retain | tests/activeclinic-public-booking.test.js; tests/v8-shared-forms-e2e.test.js | FULL |
| Book route/inquiry backend | AC-REG-INQUIRY-01..05 | AC | Booking target resolution and rejection paths | booking linkage and public booking | FULL | retain | tests/activeclinic-public-booking.test.js; tests/activeclinic-booking-patient-linkage.test.js | FULL |
| Password recovery | AC-REG-RESET-01..08 | AC/shared | Mock delivery, token lifecycle, expiry and isolation | V8 password security | FULL | retain | tests/v8-shared-auth-password-security.test.js; tests/activeclinic-transactional-email.test.js | FULL |
| Staff invitation/identity linking | AC-REG-STAFF-01..09 | AC/shared | Invite, activation, linking, expiry, membership and privilege limits | staff invitation/account lifecycle | FULL | retain | tests/activeclinic-staff-invitation.test.js; tests/activeclinic-staff-invite-phone.test.js | FULL |
| AC mobile publishing | AC-REG-MOBILEPUB-01..05 | AC | Responsive controls, permissions and shared publish route | mobile/editor client contracts | FULL | retain | tests/v7-website-mobile-editor.test.js; tests/activeclinic-editor-client-contracts.test.js | FULL |
| AC mobile image selection | AC-REG-MOBILEMEDIA-01..04 | AC/shared | Non-camera file selection and shared validation | universal image editor/media parity | FULL | retain | tests/v7-website-mobile-editor.test.js; tests/v2-01-universal-image-editor.test.js | FULL |
| AC website draft/live/versioning | AC-REG-WEBVER-01..07 | AC/shared | Draft isolation, publish, history and restore | website lifecycle/persistence | FULL | retain | tests/v7-website-draft-live-integrity.test.js; tests/v7-shared-website-editor-persistence.test.js; tests/phase4-restore-previous-website.test.js | FULL |
| Shared identity | SHARED-REG-IDENTITY-01..05 | shared | Create, link, duplicate and token isolation | identity/password suites | FULL | retain | tests/v8-shared-auth-password-security.test.js; tests/activeclinic-registration-identity-idempotency.test.js | FULL |
| Authorization/RBAC | SHARED-REG-RBAC-01..04 | shared | Allow/deny capability and no privilege widening | V8 RBAC suites | FULL | retain | tests/v8-shared-rbac-tenant-isolation.test.js; tests/activeclinic-rbac-role-matrix.test.js | FULL |
| Tenant isolation | SHARED-REG-TENANT-01..03 | shared | Cross-tenant resource denial | V8 tenant isolation | FULL | retain | tests/v8-shared-rbac-tenant-isolation.test.js; tests/v7-tenant-isolation-security.test.js | FULL |
| Product isolation | SHARED-REG-PRODUCT-01..02 | shared | BB/AC product boundary enforcement | V8 product isolation | FULL | retain | tests/v8-tenant-product-isolation.test.js; tests/activeclinic-product-isolation.test.js | FULL |
| CSRF | SHARED-REG-CSRF-01..03 | shared | Valid, missing and invalid mutation tokens | shared forms/editor contracts | FULL | retain | tests/v8-shared-forms-e2e.test.js; tests/activeclinic-mf-identity.test.js; tests/church-branch-hq-csrf-coverage.test.js | FULL |
| Common publish/versioning | SHARED-REG-WEBVER-01..05 | shared | Draft/live, publish, version and adapter parity | shared website lifecycle | FULL | retain | tests/v7-website-draft-live-integrity.test.js; tests/v8-shared-website-lifecycle.test.js; tests/v7-shared-website-editor-persistence.test.js | FULL |

## Exclusions

Branch capacity remains plan-derived and is covered by
`tests/church-plan-limits.test.js`; no manual branch-count editing regression is
introduced. Operational/content observations are intentionally not represented
as software regression cases.
