# ActiveClinic V7 — Phase 11 regression report

Broad automated regression after overnight V7 work. **NEW_REGRESSION = 0. P0 REAL_PRODUCT_BUG = 0.**

No push. No deploy. Production untouched.

## Verdict

| Check | After |
|---|---|
| NEW_REGRESSION | **0** |
| P0 REAL_PRODUCT_BUG | **0** |
| node:test suites (64 files) | **453 pass / 0 fail / 0 skip** |
| Mocha leftover files (2) | **not executed** — TEST_STALE / PRE_EXISTING runner mismatch |

Sweep method: `node --test` in logical groups. Failures classified before any test edits. Product 500s fixed; stale assertions updated only where intended behavior already changed.

## Safety

| | |
|---|---|
| Branch | V7 |
| HEAD | `082b5712944d91b23502cb7b61f2cad98969e2a7` |
| Push | no |
| Deploy | no |

## Inventory (66 files)

| Module | Files |
|---|---|
| Public / registration / directory | `public-website`, `clinic-directory`, `clinic-registration` |
| Booking / portal | `public-booking`, `phase5a-procedure-booking`, `patient-portal`, `booking-patient-linkage` |
| Phone / auth / session | `phone-standardization`, `authentication-foundation`, `auth-stitch-parity`, `account-lifecycle`, `session-principal` |
| Patient | `patient-foundation`, `patient-registration-rbac`, `patient-ui-parity`, `patient-merge-safety`, `phase4-patient-print-card` |
| Appointments / reception | `appointment-foundation`, `appointment-ui-parity`, `phase5b-appointments-reception`, `reception-foundation`, `reception-ui-parity` |
| Clinical / diagnostics | `clinical-foundation`, `clinical-ui-parity`, `diagnostics-foundation`, `diagnostics-rbac` |
| Pharmacy / departments | `pharmacy-foundation`, `pharmacy-ui-parity`, `phase4-pharmacy-ops`, `phase5c-pharmacy-partials`, `departments-pharmacy-regression` |
| Billing / cashier / finance | `phase4-billing-ops`, `phase5d-billing-cashier-partials`, `finance-rbac` |
| Settings / facility / staff / tenant | `organization-settings-parity`, `facility-foundation`, `facilities-parity`, `staff-management-parity`, `staff-directory-parity`, `staff-invitation`, `staff-rbac-foundation`, `roles-access-parity`, `roles-access-admin`, `admin-role-migration`, `product-isolation`, `deployment-foundation` |
| RBAC / shell / visual / phase 8–10 | `rbac-role-matrix`, `multi-role-rbac`, `navigation-rbac`, `application-shell`, `dashboard-capabilities`, `dashboard-shell-parity`, `foundation-states-parity`, `pass5-missing-states`, `pass6-media`, `pass7-mobile`, `pass8-design-system`, `phase8-mobile`, `phase9-a11y`, `phase10-browser`, `phase5e-partial-closure` |
| Demo / QA | `demo-clinics-seed`, `demo-role-users`, `qa-role-users` |
| Not run under `node --test` | `billing-ui-parity` (Mocha `beforeAll`), `diagnostics-ui-parity` (missing `testUtilities/dbTestUtilities`) |

## Per-suite results

| Group | Command | Pass | Fail | Skip |
|---|---|---|---|---|
| A public / registration / directory | `node --test tests/activeclinic-public-website.test.js tests/activeclinic-clinic-directory.test.js tests/activeclinic-clinic-registration.test.js` | 25 | 0 | 0 |
| B booking / portal | `node --test tests/activeclinic-public-booking.test.js tests/activeclinic-phase5a-procedure-booking.test.js tests/activeclinic-patient-portal.test.js tests/activeclinic-booking-patient-linkage.test.js` | 25 | 0 | 0 |
| C phone / auth / session | `node --test tests/activeclinic-phone-standardization.test.js tests/activeclinic-authentication-foundation.test.js tests/activeclinic-auth-stitch-parity.test.js tests/activeclinic-account-lifecycle.test.js tests/activeclinic-session-principal.test.js` | 55 | 0 | 0 |
| D patient | `node --test tests/activeclinic-patient-foundation.test.js tests/activeclinic-patient-registration-rbac.test.js tests/activeclinic-patient-ui-parity.test.js tests/activeclinic-patient-merge-safety.test.js tests/activeclinic-phase4-patient-print-card.test.js` | 32 | 0 | 0 |
| E appointments / reception | `node --test tests/activeclinic-appointment-foundation.test.js tests/activeclinic-appointment-ui-parity.test.js tests/activeclinic-phase5b-appointments-reception.test.js tests/activeclinic-reception-foundation.test.js tests/activeclinic-reception-ui-parity.test.js` | 18 | 0 | 0 |
| F clinical / diagnostics | `node --test tests/activeclinic-clinical-foundation.test.js tests/activeclinic-clinical-ui-parity.test.js tests/activeclinic-diagnostics-foundation.test.js tests/activeclinic-diagnostics-rbac.test.js` | 28 | 0 | 0 |
| G pharmacy / departments | `node --test tests/activeclinic-pharmacy-foundation.test.js tests/activeclinic-pharmacy-ui-parity.test.js tests/activeclinic-phase4-pharmacy-ops.test.js tests/activeclinic-phase5c-pharmacy-partials.test.js tests/activeclinic-departments-pharmacy-regression.test.js` | 45 | 0 | 0 |
| H billing / cashier / finance | `node --test tests/activeclinic-phase4-billing-ops.test.js tests/activeclinic-phase5d-billing-cashier-partials.test.js tests/activeclinic-finance-rbac.test.js` | 23 | 0 | 0 |
| I mocha leftovers | `node --test tests/activeclinic-billing-ui-parity.test.js tests/activeclinic-diagnostics-ui-parity.test.js` | 0 | 2 files | 0 |
| J settings / staff / tenant | `node --test tests/activeclinic-organization-settings-parity.test.js tests/activeclinic-facility-foundation.test.js tests/activeclinic-facilities-parity.test.js tests/activeclinic-staff-management-parity.test.js tests/activeclinic-staff-directory-parity.test.js tests/activeclinic-staff-invitation.test.js tests/activeclinic-staff-rbac-foundation.test.js tests/activeclinic-roles-access-parity.test.js tests/activeclinic-roles-access-admin.test.js tests/activeclinic-admin-role-migration.test.js tests/activeclinic-product-isolation.test.js tests/activeclinic-deployment-foundation.test.js` | 82 | 0 | 0 |
| K RBAC / shell / visual / phase 8–10 | `node --test tests/activeclinic-rbac-role-matrix.test.js tests/activeclinic-multi-role-rbac.test.js tests/activeclinic-navigation-rbac.test.js tests/activeclinic-application-shell.test.js tests/activeclinic-dashboard-capabilities.test.js tests/activeclinic-dashboard-shell-parity.test.js tests/activeclinic-foundation-states-parity.test.js tests/activeclinic-pass5-missing-states.test.js tests/activeclinic-pass6-media.test.js tests/activeclinic-pass7-mobile.test.js tests/activeclinic-pass8-design-system.test.js tests/activeclinic-phase8-mobile.test.js tests/activeclinic-phase9-a11y.test.js tests/activeclinic-phase10-browser.test.js tests/activeclinic-phase5e-partial-closure.test.js` | 109 | 0 | 0 |
| L demo / QA | `node --test tests/activeclinic-demo-clinics-seed.test.js tests/activeclinic-demo-role-users.test.js tests/activeclinic-qa-role-users.test.js` | 11 | 0 | 0 |

Group C/D/F/J first-run failures are listed below; counts above are **after** in-scope fixes.

## Failures classified (first run)

| ID | Test | First result | Classification | Action |
|---|---|---|---|---|
| P11-H1 | `POST /app/facilities/:key` edit | **500** `auth is not defined` | **NEW_REGRESSION** (P0) | Fixed product |
| P11-H2 | `POST /app/staff/:id` edit | **500** `auth is not defined` | **NEW_REGRESSION** (P0) | Fixed product |
| P11-T1 | account-lifecycle: suspend last org admin | `suspendStaffAccess.ok === false` (`LAST_ORG_ADMIN`) | **TEST_STALE** | Fixture now keeps a second admin |
| P11-T2 | patient-foundation: register/add identifiers as org admin + receptionist | `identifier_management_required` / `access_denied` | **TEST_STALE** | Fixture adds medical-records officer |
| P11-T3 | clinical-ui-parity: `GET /app/clinical` 403 | department unavailable (1692-byte page) | **TEST_STALE** | Seed default OPD/triage departments |
| P11-T4 | settings overview `doesNotMatch(/billing\|pharmacy/)` | sidebar nav labels | **TEST_STALE** | Drop nav words; keep census/subscription |
| P11-T5 | staff directory `doesNotMatch(/token/)` | `ac-tokens.css` | **TEST_STALE** | Drop generic `token`; keep secret markers |
| P11-S1 | `activeclinic-billing-ui-parity.test.js` | Mocha `beforeAll`, no `node:test` | **TEST_STALE** / **PRE_EXISTING** | Not converted |
| P11-S2 | `activeclinic-diagnostics-ui-parity.test.js` | missing `testUtilities/dbTestUtilities` | **TEST_STALE** / **PRE_EXISTING** | Not converted |

No **REAL_PRODUCT_BUG** left open. Identifier gating, last-admin suspend protection, and department gating were confirmed intended (HTTP RBAC + finance/pharmacy suites already encode the same rules).

## Fixes

### Product (NEW_REGRESSION)

PhoneField overnight work passed `clinicDefaultCountry` from `auth.healthcareOrganization` in POST handlers that never declared `auth`.

| File | Change |
|---|---|
| `src/activeclinic/http/activeClinicFacilityRoutes.js` | `const auth = req.activeClinicAuth` on facility update POST |
| `src/activeclinic/http/activeClinicStaffRoutes.js` | `const auth = req.activeClinicAuth` on staff edit POST |

Create-facility and create-staff already declared `auth`. After the fix: `POST /app/facilities/east-wing` → 303; `POST /app/staff/:id` → 303.

### Tests (intended behavior already changed)

| File | Why the test was stale |
|---|---|
| `tests/activeclinic-account-lifecycle.test.js` | Last org-wide admin cannot be suspended (`assertNotLastOrgAdminRemoval`) |
| `tests/activeclinic-patient-foundation.test.js` | Authoritative IDs require `activeclinic.patient.manage_identifiers` (medical records, not receptionist/org admin) |
| `tests/activeclinic-clinical-ui-parity.test.js` | Clinical module requires active OPD or triage department — same as appointment/reception UI tests |
| `tests/activeclinic-organization-settings-parity.test.js` | Org-admin shell nav includes Billing and Pharmacy |
| `tests/activeclinic-staff-directory-parity.test.js` | Shell stylesheet is `ac-tokens.css`; CSRF values are not HR secrets |

## Security suites (priority)

| Concern | Result |
|---|---|
| Tenant isolation | Pass — pharmacy, billing, finance, clinical, patient, facilities |
| Facility isolation | Pass — staff directory, departments, facilities, reception |
| Department gating | Pass — `departments-pharmacy-regression`; clinical 403 without OPD/triage is intended |
| RBAC | Pass — role matrix, multi-role, navigation, diagnostics modality, patient-registration, staff |
| CSRF | Pass — clinical start-encounter, pharmacy catalogue, staff/facility/settings POSTs |
| Finance mutation rules | Pass — cashier/billing officer/supervisor SoD; org admin transactional writes denied |
| Pharmacy mutations | Pass — dispense/stock/PO; unauthorized denied; tenant isolation |
| Phone normalization | Pass — `phone-standardization`, QA Zambia login |

## Remaining (not blockers)

- Mocha UI-parity files are not on the `node --test` path. Do not treat as overnight product regressions.
- `createFacility` does not auto-call `ensureDefaultDepartments` (demo seed does). New facilities via UI need Clinic Setup before clinical/pharmacy/billing modules. Candidate for **Phase 12** data/state completeness — not a P0 500.

## Next

**PHASE 12 — data/state completeness audit.**
