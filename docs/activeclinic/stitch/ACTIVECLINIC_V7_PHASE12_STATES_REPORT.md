# ActiveClinic V7 — Phase 12 state completeness

Audit of non-happy-path states on major lists and workflows. **No fake production API failures. No new redundant routes.**

No push. No deploy. Production untouched.

## Verdict

Canonical V7 state component (`ac-inline-state` / `access-state` / `acp-shared-state` / directory states) now covers the listed surfaces. Dedicated Stitch state screens are used where they exist; otherwise the shared taxonomy.

| Required | Status |
|---|---|
| EMPTY | Implemented on major lists (inline) |
| LOADING | Form `data-ac-loading` + directory loading presentation (test-only query; no fake prod fetch) |
| ERROR | Full-page `request_error` + directory/invoice/lookup errors |
| SUCCESS | Terminal pages + shell flash |
| VALIDATION_ERROR | Form re-render (`data-ac-form-state`) |
| PERMISSION_DENIED | 403 `access_restricted` |
| DEPARTMENT_DISABLED | 403 `department_not_configured` |
| FACILITY_UNAVAILABLE | Select-facility empty + taxonomy key |
| NOT_FOUND | 404 clinic / resource concealment |
| OFFLINE | `/app/offline` 503 + patient `/offline` — **no service worker** |

## State matrix

| Area | EMPTY | LOADING | ERROR | SUCCESS | VALIDATION | PERMISSION | DEPT | FACILITY | NOT_FOUND | OFFLINE |
|---|---|---|---|---|---|---|---|---|---|---|
| Public directory | yes (Stitch P21) | yes (presentation) | yes (Stitch P21) | n/a | n/a | n/a | n/a | n/a | n/a | n/a |
| Registration | n/a | form busy | server error page | `/register-clinic/success` | yes | n/a | n/a | n/a | n/a | n/a |
| Juflona | doctors/services/pricing empty | form busy | clinic unavailable | contact success | contact form | n/a | n/a | n/a | clinic not found | n/a |
| Booking | procedures empty | form busy | lookup / slot errors | request submitted | wizard forms | n/a | n/a | n/a | clinic 404 | n/a |
| My Booking | n/a | n/a | lookup error | submitted/cancel/reschedule | token required | n/a | n/a | n/a | invalid token | n/a |
| Portal | dashboard empty (Stitch P27) | form busy | login/link errors | verification success | auth forms | n/a | n/a | n/a | n/a | `/patient/offline` |
| Patients | list empty / no-results | form busy | flash | registration success | patient form | 403 | n/a (clinic-wide) | select-facility | 404 | `/app/offline` |
| Appointments | list / calendar / missed | form busy | form alert | appointment success | appointment form | 403 | reception dept | select-facility | 404 | `/app/offline` |
| Reception | queue / call board | form busy | stale warning | flash | walk-in form | 403 | reception dept | select-facility | 404 | `/app/offline` |
| Clinical | queue / alerts | form busy | form alert | flash | encounter forms | 403 | OPD/triage | select-facility | 404 | `/app/offline` |
| Pharmacy | queue / catalogue / PO / inventory | form busy | form alert | dispense completed | stock forms | 403 | pharmacy dept | select-facility | 404 | `/app/offline` |
| Lab / radiology | lab queue / worklist / radiology queue | form busy | form alert | flash | result forms | 403 | lab/rad dept | select-facility | 404 | `/app/offline` |
| Billing | invoices / AR / payments / catalog | form busy | invoice error | flash / cashier closed | charge forms | 403 | billing dept | select-facility | 404 | `/app/offline` |
| Settings | departments empty | form busy | flash | flash | org/regional forms | 403 | n/a | select-facility | 404 | `/app/offline` |

Dashboards with zero metrics (pharmacy/billing/lab) are valid empty **counts**, not list EMPTY.

## Missing before → implemented

| Gap | Before | After |
|---|---|---|
| Clinical queue / alerts | Ad-hoc `ac-empty-state` paragraph | `ac-inline-state` EMPTY |
| Lab queue / worklist / radiology queue | Ad-hoc empty paragraph | `ac-inline-state` EMPTY |
| Pharmacy purchase orders | Muted paragraph | `ac-inline-state` EMPTY + gated CTA |
| Payment history | Muted paragraph | `ac-inline-state` EMPTY |
| Booking identity links | Muted `data-ac-empty` | `ac-inline-state` EMPTY |
| Select facility with none | Custom panel | `facility_unavailable` taxonomy |
| Portal dashboard empty | Unmarked copy | `acp-shared-state` EMPTY |
| Directory / Juflona / success terminals | Mixed markers | `data-ac-state-key` on taxonomy |

## Remaining (not blockers)

- **Browser offline detection / service worker** — still deferred. `/app/offline` and patient offline are presentation routes only. Do not invent a fake network layer.
- **Production directory loading** is not a simulated slow API. The loading card is a real template; `_directoryLoading=1` is test-only (`NODE_ENV=test`).
- Stitch SMS / “progress” booking screens stay honesty notes — no fake SMS.
- Mocha `billing-ui-parity` / `diagnostics-ui-parity` still not on `node --test` (Phase 11).

## Stitch (both ActiveClinic projects)

| Surface | Project | Representative screens |
|---|---|---|
| Public / booking / portal | `17813606734422395399` | Directory empty/error/loading; onboarding validation/success; clinic not found / unavailable; patient dashboard empty; portal offline |
| Internal ops | `12272131183982732110` | P01 Shared States; Access Restricted; Shared Error/Loading/Offline; P02 Patient Shared States; P03 Appointment Shared States |

No BlessBoard screens used.

## Files

- `src/activeclinic/services/activeClinicStateTaxonomy.js` — `FACILITY_UNAVAILABLE`
- `views/activeclinic/app/access-state.ejs`
- `views/activeclinic/app/clinical-queue-content.ejs`
- `views/activeclinic/app/clinical-escalation-alert-content.ejs`
- `views/activeclinic/app/diagnostics-laboratory-queue-content.ejs`
- `views/activeclinic/app/diagnostics-laboratory-worklist-content.ejs`
- `views/activeclinic/app/diagnostics-radiology-queue-content.ejs`
- `views/activeclinic/app/pharmacy-purchase-orders-content.ejs`
- `views/activeclinic/app/billing-payment-history-content.ejs`
- `views/activeclinic/app/booking-requests-content.ejs`
- `views/activeclinic/app/select-facility-content.ejs`
- `views/activeclinic/app/appointment-success-content.ejs`
- `views/activeclinic/app/patient-success-content.ejs`
- `views/activeclinic/app/billing-invoice-error-content.ejs`
- `views/activeclinic/patient/dashboard-empty.ejs`
- `views/activeclinic/patient/offline.ejs`
- `views/activeclinic/partials/public-directory-state.ejs`
- `views/activeclinic/partials/acp-shared-state.ejs`
- `views/activeclinic/tenant/{doctors,services,pricing,clinic-not-found,clinic-unavailable}.ejs`
- `views/activeclinic/booking/{procedures-list,my-booking-lookup,request-submitted}.ejs`
- `views/activeclinic/public/register-clinic-success.ejs`

## Tests

`tests/activeclinic-phase12-states.test.js` — **10 pass**

- Taxonomy `facility_unavailable` / `offline`
- Canonical empty markers on major lists
- `/app/offline` 503
- Unknown clinic 404
- Directory loading presentation (test hook)
- Register-clinic validation
- Clinical / patients / reception EMPTY HTTP
- Receptionist pharmacy 403 permission
- Org with no facilities → `facility_unavailable`
- Inactive pharmacy department → 403 department unavailable

## Next

**PHASE 13 — data integrity / domain rules.**
