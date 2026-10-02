# AC-V6-C02 — Patient Registration, Search and Profile

**Stage:** AC-V6-C02  
**Date:** 2026-08-04  
**Verdict:** `ACTIVECLINIC_V6_C02_PATIENT_UI_PARTIAL`

Prerequisite **AC-V6-C01** is COMPLETE. Patient Stitch P02 screens exist; UI is implemented on the ActiveClinic shell with stitch ID markers. Pixel / chrome parity vs full Stitch packs is **VISUAL_BLOCKED** where clinical-admin chrome differs from the foundation shell.

---

## Exact Stitch screens (mapped)

| Exact Stitch name | Stitch ID | Route / surface | Status |
|---|---|---|---|
| P02 – Patient List – Desktop | `5a6728d97b674200823562bb015e10ed` | `GET /app/patients` | PARTIAL |
| P02 – Patient List – Mobile | `58bd5e04f71340ff8d067721eb5562d4` | same | PARTIAL |
| P02 – Register Patient Identity | `40d2005b64864f35ac8df831ddae7084` | `GET/POST /app/patients/new` | PARTIAL |
| P02 – Register Patient Contact | `e1ef5e5d8a1840bcbf1f4dc859f7b812` | register form section | PARTIAL |
| P02 – Register Patient Emergency and Medical | `026d2e6c69cd4181a282213ba1bb55da` | emergency section only (no clinical medical) | PARTIAL |
| P02 – Register Patient Review | `8ef4b4d96f1f4224994d0c627bb7550e` | `step=review` | PARTIAL |
| P02 – Duplicate Patient Warning | `91e41fecc2b64496893b52317b7ab985` | inline warning panel | PARTIAL |
| P02 – Patient Registration Success | `cd688e761cca43a1af299769014cb5f0` / mobile `b9615559…` | success view | PARTIAL |
| P02 – Patient Profile Overview | `1a15f0bf4e564c4993ca33aa2d578a58` / mobile `99eb441b…` | `GET /app/patients/:patientNumber` | PARTIAL |
| P02 – Edit Patient Details | `0c3315d05469499d9b645bc7978001bf` / mobile `4c6a5fe1…` | edit routes | PARTIAL |
| P02 – Print Patient Card | `3c113fe684604dfcaeb8f6b2c071a6ca` | **deferred** | NOT_STARTED |
| P02 – Patient Shared States | `f98b2e6f2a4a4953a4d811af7b3737a2` | empty / no-results via S08 components | PARTIAL |

---

## Routes

| Route | Permission |
|---|---|
| `GET /app/patients` | `patient.search` |
| `GET /app/patients/new` | `patient.create` |
| `POST /app/patients` | `patient.create` + CSRF |
| `GET /app/patients/:patientNumber` | `patient.view` |
| `GET/POST …/edit` | `patient.update` + CSRF |
| `POST …/identifiers` | `patient.manage_identifiers` + CSRF |
| `POST …/emergency-contacts` | `patient.update` + CSRF |
| `POST …/archive` | `patient.archive` + CSRF |
| `POST …/mark-deceased` | `patient.archive` + CSRF |

Canonical public path key is **patient number** (`AC-YYYY-NNNNNN`), not UUID.

---

## Security / privacy

- HCO + facility scope via C01 services  
- Search results minimized (masked phone; no full identifiers/address/emergency)  
- Duplicate override requires permission + reason  
- No clinical tabs or fake clinical content  
- CSRF on all writes  
- Nav item **Patients** gated on `patient.search`

---

## Tests

```bash
node --test --test-concurrency=1 tests/activeclinic-patient-ui-parity.test.js
```

Also: C01 foundation, db-bootstrap, application-shell (30/30 combined in recovery run).

---

## Remaining gaps

- Pixel Stitch chrome / wizard multi-page visual pack  
- Print patient card  
- Dedicated medical section omitted (clinical out of scope)  
- Identifier search UI filter (service supports; list form focuses name/number/phone/DOB)

---

## Gate for AC-V6-C03

**OPEN (non-blocking PARTIAL).** Patient identity, search, registration UI, and facility scope are functional. Appointment backend may begin.
