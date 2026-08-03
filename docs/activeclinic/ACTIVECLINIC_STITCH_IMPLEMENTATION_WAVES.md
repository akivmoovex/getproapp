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
