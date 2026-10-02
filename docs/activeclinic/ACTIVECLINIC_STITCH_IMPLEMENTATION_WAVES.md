# ActiveClinic — Stitch Implementation Waves (AC-V6-11)

**Inventory:** [ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md](ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md)  
**Decisions:** [ACTIVECLINIC_STITCH_PRODUCT_DECISIONS.md](ACTIVECLINIC_STITCH_PRODUCT_DECISIONS.md)

---

## Backend readiness rollup (Stitch screens)

| Classification | Count | Meaning |
|---|---:|---|
| READY_FOR_UI | 0 | No Stitch screen has full route+service+schema+actions+visual claim yet |
| READY_READ_ONLY / PARTIAL_BACKEND | 11 | P01 + platform shared states (auth/shell exist; visual parity pending) |
| DUPLICATE | 6 | Unprefixed Login/Dashboard/Shell/Drawer |
| SCHEMA_REQUIRED / NOT_STARTED | 97 | P02–P07 |
| PRODUCT_DECISION | see PD docs | Admin STITCH_GAP, offline, clinical roles |
| SECURITY_REVIEW | ~55 | P04 + sensitive P05/P06 |
| VISUAL_ONLY | 0 recommended | Do not mock clinical as fake-live |

**Code-only surfaces (no Stitch):** facilities list/detail, staff list, access, settings, selectors, lifecycle pages — **READY_FOR_UI** (utilitarian) or **READY_READ_ONLY** without claiming Stitch MATCHED.

---

## Wave 1 — Foundation administration & auth visual parity

**Screens (Stitch):**

- P01 – Login – Desktop / Mobile  
- P01 – Shared Application Shell – Desktop  
- P01 – Navigation Drawer – Mobile  
- P01 – Dashboard – Desktop / Mobile  
- P01 – Shared States – Desktop  
- Shared Error / Loading / Offline; Access Restricted  

**Also in wave (backend-ready, STITCH_GAP — utilitarian OK):**

- Org select, activate, forgot/reset (functional polish; no false MATCHED)  
- `/app` home, facilities list/detail, staff list, access overview, settings landing, facility/org select  

**Prerequisites:** AC-V6-02…10 complete (verified in code).  
**Permissions:** existing catalogue only.  
**Migrations:** none required for visual parity.  
**Components:** shell tokens, auth layout, state partials, list/detail patterns.  
**Tests:** per [ACTIVECLINIC_STITCH_TEST_STRATEGY.md](ACTIVECLINIC_STITCH_TEST_STRATEGY.md).  
**Product decisions:** PD-AC-01, PD-AC-02, PD-AC-09.  
**Completion verdict:** `ACTIVECLINIC_V6_FOUNDATION_STITCH_WAVE1_COMPLETE` when P01 login/shell/dashboard parity claimed and foundation routes regression-green.

**Explicit exclusions:** P02–P07; facility/staff create Stitch claims; clinical nav items.

---

## Wave 2 — Patients & appointments

**Screens:** P02 family; P03 appointment list/calendar/book/reschedule/confirmation (not full reception ops).  
**Prerequisites:** patient + appointment schemas, repos, services, permissions, audit.  
**Verdict:** deferred until SCHEMA_REQUIRED cleared.

## Wave 3 — Reception, queue, triage ops

**Screens:** P03 reception/queue/check-in/transfer; P04 triage/nursing/vitals entry start.  
**Prerequisites:** visit/queue status model.

## Wave 4 — Consultation & medical records

**Screens:** P04 consultation, diagnosis, Rx/lab/rad request creation.  
**Prerequisites:** confidentiality (PD-AC-06), SECURITY_REVIEW.

## Wave 5 — Laboratory & imaging

**Screens:** P06 family.  
**Prerequisites:** orders, specimens, results, critical alert rules.

## Wave 6 — Pharmacy & medication

**Screens:** P05 family.  
**Prerequisites:** formulary, stock, batches, dispensing, label standards.

## Wave 7 — Billing & reporting

**Screens:** P07 family (+ future reports).  
**Prerequisites:** PD-AC-08, invoices/payments.

---

## First safe Stitch wave (confirmed)

Smallest safe set using **real** backends + shared shell + low security risk:

1. P01 – Login – Desktop  
2. P01 – Login – Mobile  
3. Login org selection (**STITCH_GAP** — keep functional)  
4. Activate / Forgot / Reset (**STITCH_GAP**)  
5. P01 – Shared Application Shell – Desktop  
6. P01 – Navigation Drawer – Mobile  
7. P01 – Dashboard – Desktop / Mobile  
8. Shared Error / Loading / Offline / Access Restricted (+ P01 Shared States)  
9. Facilities list/detail (**STITCH_GAP** utilitarian)  
10. Staff list (**STITCH_GAP**)  
11. Access overview (**STITCH_GAP** read-only)  
12. Mobile empty/error behaviors on those lists  

**Routes:** `/login`, `/login/select-organization`, `/activate/:token`, `/forgot-password`, `/reset-password/:token`, `/app`, `/app/facilities`, `/app/facilities/:facilityKey`, `/app/staff`, `/app/access`, `/app/settings`, `/app/select-*`  

**Permissions:** existing only.  
**Services:** auth, lifecycle, shell VM, facility list/get, staff list, navigation.  
**Shared components:** auth layout, app shell, drawer, page header, list/table, state partials.  
**Tests:** auth + shell + facilities/staff permission + BlessBoard isolation.  
**Exclusions:** clinical Stitch; fake KPIs requiring clinical data; new permissions/migrations.

---

## Token-efficient Cursor prompt sequence

| Code | Name | Screen group | Depends on |
|---|---|---|---|
| **AC-V6-S01** | Authentication Visual Parity | P01 Login D/M; polish activate/forgot/reset without inventing Stitch | AC-V6-11 gate |
| **AC-V6-S02** | Organization and Facility Selection | select-org (login + in-app), select-facility; shell switchers | S01 optional |
| **AC-V6-S03** | Dashboard and Shell Refinement | P01 Shell, Drawer, Dashboard D/M; shared states | S01 |
| **AC-V6-S04** | Facilities List and Detail | utilitarian list/detail → closer to design system | S03 |
| **AC-V6-S05** | Facility Create and Edit | proposed routes + forms (STITCH_GAP) | S04 + facility write services |
| **AC-V6-S06** | Staff List and Detail | list polish + **new** detail page | S03 |
| **AC-V6-S07** | Staff Invitation and Activation Actions | invite UI wired to existing POSTs | S06 + AC-V6-09 |
| **AC-V6-S08** | Roles and Access | access overview → assignment editor | S06 |
| **AC-V6-S09** | Foundation Empty/Error/Mobile States | Shared states + list empties | S03–S06 |
| **AC-V6-S10** | Foundation Visual Regression Review | P01 + admin surfaces checklist | S01–S09 |

Each later prompt must list: exact Stitch names, routes, services, permissions, components, tests, non-goals, final verdict.

**Gate for AC-V6-S01:** **OPEN** (see final report) — mapping complete enough to begin login visual parity; clinical deferred; no screen implemented in AC-V6-11.

### AC-V6-S01 status

- **PARTIAL** — P01 Login desktop/mobile shipped with shared auth layout; lifecycle/org/password pages use same shell without Stitch MATCHED claims.
- Detail: `docs/activeclinic/stitch/AC_V6_S01_AUTHENTICATION_PARITY.md`
- Next: **AC-V6-S02** (organization and facility selection) per sequence table.

---

## Duplicate / obsolete review

| Candidates | Evidence | Canonical | Exclude from impl? | Risk |
|---|---|---|---|---|
| Login/Dashboard/Shell/Drawer unprefixed | Parallel titles to P01 | **P01 – …** | Yes as targets; retain in Stitch | Low — use wrong screenshot |
| Application Shell vs P01 Shared Application Shell | Duplicate shell | P01 Shared Application Shell | Yes for targeting | Low |
| Older clinical explorations | Not proven obsolete without revision metadata | Keep all; implement later by package | N/A | Do not delete |

---

## Asset / media audit

| Asset | Local | Stitch | First wave |
|---|---|---|---|
| Screenshots | no (download URLs only) | yes via MCP | compare in Cursor Browser |
| Logos / icons | check `public/activeclinic` (minimal) | in HTML/screenshot | CSS/icon preferred |
| Clinical photos / avatars | no | in screenshots | not for W1 |
| Medicine labels / print | no | P05/P02 print screens | Wave 2/6 |
| Licensed stock | unknown | treat as Stitch-derived mock | do not vendor unknown licenses |

**Blocked visual parity:** none for W1 login/shell if MCP screenshots reachable; admin STITCH_GAP is design gap not asset gap.


### AC-V6-S02 status

- **PARTIAL** — canonical shell + foundation dashboard shipped; clinical Stitch KPIs omitted.
- Detail: `docs/activeclinic/stitch/AC_V6_S02_DASHBOARD_SHELL_PARITY.md`
- Executed sequence note: S02 in shipped docs = Dashboard/Shell (user prompt AC-V6-S02), not the older “org/facility selection” row in the table above.

### AC-V6-S03 status

- **PARTIAL** — facilities list/detail/create/edit/archive/set-primary functional on S02 shell; **VISUAL_BLOCKED** (no Stitch facility screens).
- Detail: `docs/activeclinic/stitch/AC_V6_S03_FACILITIES_PARITY.md`
- Next: **AC-V6-S04 — Staff List and Staff Detail** (utilitarian / STITCH_GAP)

### AC-V6-S04 status

- **PARTIAL** — staff list/detail functional on S02 shell with facility-scoped directory rules; lifecycle actions link to existing admin POSTs; **VISUAL_BLOCKED**.
- Detail: `docs/activeclinic/stitch/AC_V6_S04_STAFF_DIRECTORY_DETAIL_PARITY.md`
- Next: **AC-V6-S05 — Staff Invitation and Account Actions** (or Create/Edit Staff forms)

### AC-V6-S05 status

- **PARTIAL** — create/invite form, confirmation share panel, edit profile + facility sync; account actions remain on detail + admin POSTs; **VISUAL_BLOCKED**.
- Detail: `docs/activeclinic/stitch/AC_V6_S05_STAFF_CREATE_INVITE_EDIT_PARITY.md`
- Next: **AC-V6-S06 — Roles and Access Management**

### AC-V6-S06 status

- **PARTIAL** (non-blocking) — access overview, staff access detail, assign/edit/revoke foundational roles with grantability guards; facility admins gained `assign_access` via additive migration 079; **VISUAL_BLOCKED** (no Stitch access screens). **S06R (2026-08-04):** bootstrap **26/26**, roles-access parity **4/4**, `/app/access` confirmed real (not stub).
- Detail: `docs/activeclinic/stitch/AC_V6_S06_ROLES_ACCESS_PARITY.md`
- Next: **AC-V6-S07 — Organization Settings and Healthcare Profile** (unlocked)

### AC-V6-S07 status

- **PARTIAL** (non-blocking) — settings overview, organization profile/edit, facilities/access/account links; completeness + status separation; **VISUAL_BLOCKED**. **S07R (2026-08-04):** settings parity **4/4**; protected fields enforced.
- Detail: `docs/activeclinic/stitch/AC_V6_S07_ORGANIZATION_SETTINGS_PARITY.md`
- Next: **AC-V6-S08 — Foundation Empty, Error and Restricted States** (unlocked)

### AC-V6-S08 status

- **PARTIAL** (non-blocking) — state taxonomy, shared inline/full-page states, error middleware, empty/no-results across foundation modules, context-unavailable for ineligible sessions; Shared Offline **deferred**; **VISUAL_BLOCKED** vs Stitch state pack. **S08R (2026-08-04):** foundation-states parity **12/12**; AC foundation regression **68/68**.
- Detail: `docs/activeclinic/stitch/AC_V6_S08_FOUNDATION_STATES_QUALITY_GATE.md`
- Next: **AC-V6-C02 — Patient Registration, Search and Profile Stitch Parity** (C01 backend already complete)

### AC-V6-C01 status

**COMPLETE (backend foundation).** Schema, permissions, repositories, services, duplicate detection, search scope, tests, and clinical docs landed.

### AC-V6-C02 status

- **PARTIAL** — patient list/search, register (review + duplicate warning + success), profile, edit, identifier/emergency POSTs, archive/deceased; nav **Patients**; stitch markers present; print card deferred; **VISUAL_BLOCKED** vs full P02 chrome.
- Detail: `docs/activeclinic/stitch/AC_V6_C02_PATIENT_REGISTRATION_SEARCH_PROFILE.md`
- Next: **AC-V6-C03 — Appointment and Scheduling Backend Foundation**

### AC-V6-C03 status

- **COMPLETE (backend foundation)** — service types, appointments, append-only status events, reminder metadata (no `sent`), permissions (conservative), collision checks, transactional reschedule, scope/audit docs; no Stitch appointment UI; no encounters.
- Docs: `docs/activeclinic/clinical/ACTIVECLINIC_APPOINTMENT_*.md`, `ACTIVECLINIC_SCHEDULING_RULES.md`
- Tests: `tests/activeclinic-appointment-foundation.test.js`
- Next: **AC-V6-C04 — Appointment Stitch UI** (parallel to C05 — do NOT implement reception UI in C04)

### AC-V6-C04 status

- **PARTIAL** — appointment list/calendar (desktop + mobile list alternative), book (review + confirm), detail, reschedule, cancel, check-in, no-show; nav **Appointments**; stitch markers; server slot revalidation; no clinical content; doctor schedule / reception UI deferred. **VISUAL_BLOCKED** vs full P03 chrome.
- Detail: `docs/activeclinic/stitch/AC_V6_C04_APPOINTMENT_PARITY.md`
- Tests: `tests/activeclinic-appointment-ui-parity.test.js`
- Next: **AC-V6-C05** reception backend (COMPLETE) → **AC-V6-C06** reception/queue Stitch UI

### AC-V6-C05 status

- **COMPLETE (backend foundation)** — reception arrivals, queue entries, queue status history (append-only), service points, queue priorities, check-in events, administrative reception notes; statuses: waiting, called, serving, paused, completed, cancelled, left_before_service, transferred; permissions (conservative — staff role gets NONE); services: checkInScheduledPatient, checkInWalkInPatient, createQueueEntry, listFacilityQueue, callNextQueueEntry, startServingQueueEntry, completeQueueEntry, pauseQueueEntry, transferQueueEntry, cancelQueueEntry, markLeftBeforeService; HCO + facility scope, atomic queue position allocation, duplicate prevention, status transitions validated, no triage/clinical/encounter creation, walk-in requires existing patient, no client-authoritative queue order; migrations 014/082, foundationVerify approved tables.
- Docs: `docs/activeclinic/clinical/ACTIVECLINIC_RECEPTION_MODEL.md`, `ACTIVECLINIC_QUEUE_LIFECYCLE.md`, `ACTIVECLINIC_QUEUE_ORDERING.md`, `ACTIVECLINIC_RECEPTION_SCOPE_AND_AUDIT.md`
- Tests: `tests/activeclinic-reception-foundation.test.js`
- Next: **AC-V6-C06 — Reception and Queue Stitch Parity**
