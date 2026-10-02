# ActiveClinic Stitch — Route Matrix (Phases 1–7)

**Audited:** 2026-08-04  
**Authority:** Stitch `P01`–`P07` packages (not AC-V6-S* waves).

## Legend

| Backend | Meaning |
|---------|---------|
| READY | Route + service + schema + auth can support the screen |
| PARTIAL | Some real data; designed features unsupported |
| BLOCKED | Schema/service/product/security blocker |
| PRESENTATION_ONLY | Informational/state UI without new backend |
| DUPLICATE | Superseded by canonical P01 screen |

## Phase 1 — P01 Auth / Shell

| Exact Stitch name | Canonical route | Existing? | Backend | Status |
|-------------------|-----------------|-----------|---------|--------|
| P01 – Login – Desktop/Mobile | `/login` | Yes | READY | PARTIAL |
| P01 – Dashboard – Desktop/Mobile | `/app` | Yes | PARTIAL | PARTIAL |
| P01 – Shared Application Shell – Desktop | `/app/*` chrome | Yes | READY | PARTIAL |
| P01 – Navigation Drawer – Mobile | `/app/*` drawer | Yes | READY | PARTIAL |
| P01 – Shared States – Desktop | access/error/lifecycle | Yes | PARTIAL | PARTIAL |
| Unprefixed Login/Dashboard/Shell/Drawer | — | — | DUPLICATE | DUPLICATE |

Related non-Stitch auth routes (keep): `/login/select-organization`, `/activate/:token`, `/forgot-password`, `/reset-password/:token`, `/account/change-password`, `POST /logout`, `/app/select-facility`, `/app/select-organization`.

## Phase 2 — P02 Patients

| Exact Stitch name | Canonical route | Existing? | Backend | Status |
|-------------------|-----------------|-----------|---------|--------|
| P02 – Patient List – Desktop/Mobile | `GET /app/patients` | Yes (WIP) | READY | PARTIAL |
| P02 – Patient Profile Overview – Desktop/Mobile | `GET /app/patients/:patientNumber` | Yes (WIP) | READY | PARTIAL |
| P02 – Edit Patient Details – Desktop/Mobile | `GET/POST …/edit` | Yes (WIP) | READY | PARTIAL |
| P02 – Register Patient Identity | `GET/POST /app/patients/new` | Yes (WIP) | READY | PARTIAL |
| P02 – Register Patient Contact – Desktop/Mobile | `/app/patients/new` sections | Yes (WIP) | READY | PARTIAL |
| P02 – Register Patient Emergency and Medical – D/M | `/app/patients/new` + emergency POST | Yes (WIP) | PARTIAL | PARTIAL |
| P02 – Register Patient Review – Desktop/Mobile | `/app/patients/new` review | Yes (WIP) | PARTIAL | PARTIAL |
| P02 – Patient Registration Success – D/M | profile + success state | Yes (WIP) | READY | PARTIAL |
| P02 – Duplicate Patient Warning | POST gate on register | Yes | READY | PARTIAL |
| P02 – Print Patient Card Preview | TBD | No | BLOCKED | PRODUCT_DECISION |
| P02 – Patient Shared States – Desktop | empty/error/restricted | Partial | PARTIAL | PARTIAL |

Writes: `POST /app/patients`, `POST …/edit`, `POST …/identifiers`, `POST …/emergency-contacts`, `POST …/archive`, `POST …/mark-deceased`.

## Phases 3–7 — no application routes

| Phase | Package | Candidate route prefix | Backend | Status |
|------:|---------|------------------------|---------|--------|
| 3 | P03 | `/app/appointments`, `/app/reception` | BLOCKED | SCHEMA_BLOCKED |
| 4 | P04 | `/app/clinical`, `/app/triage` | BLOCKED | SCHEMA_BLOCKED |
| 5 | P05 | `/app/pharmacy` | BLOCKED | SCHEMA_BLOCKED |
| 6 | P06 | `/app/lab`, `/app/imaging` | BLOCKED | SCHEMA_BLOCKED |
| 7 | P07 | `/app/billing`, `/app/cashier` | BLOCKED | SCHEMA_BLOCKED |

**Do not add placeholder clinical/finance routes that simulate success.** Navigation must not advertise dead modules.

## Redirects / dead routes

| Finding | Action |
|---------|--------|
| No clinical Stitch routes exist in app | None to remove |
| Facilities/Staff/Access/Settings routes exist without Stitch P01–P07 screens | Keep (P13 covers staff/roles later; admin ops remain functional) |
