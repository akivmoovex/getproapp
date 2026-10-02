# ActiveClinic — Screen Security Classification (AC-V6-11)

Levels: **0** public/non-sensitive · **1** org/facility/staff admin · **2** patient demographics / appointments / billing summaries · **3** clinical notes / diagnoses / Rx / lab / safeguarding.

This document classifies; it does **not** implement clinical access rules.

---

## Counts (by primary module of Stitch screens)

| Level | Approx screen count | Modules |
|---:|---:|---|
| 0 | ~20 | Login, activate/recovery (STITCH_GAP), shared loading/error/offline, access restricted |
| 1 | ~13 P01 + platform chrome (+ admin STITCH_GAP surfaces) | Shell, dashboard, admin lists |
| 2 | ~42 | P02 patients + P03 appointments/reception + P07 billing |
| 3 | ~55 | P04 clinical + P05 pharmacy (Rx/PHI) + P06 lab/imaging |

Exact inventory rows: see [ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md](ACTIVECLINIC_STITCH_SCREEN_INVENTORY.md). Pharmacy inventory screens remain Level 3 when tied to identifiable prescriptions; catalogue-only may later split — default conservative **3**.

---

## Foundation (implementable)

| Screen | Level | Min permission | Audit | Tenant | Facility | List minimization | Print |
|---|---|---|---|---|---|---|---|
| Login / forgot | 0 | — | auth events | product | — | n/a | n/a |
| Activate / reset | 0 | token | activation/reset | invitation org | — | n/a | n/a |
| Dashboard / shell | 1 | `access` | — | org | selected | no PHI | n/a |
| Facilities | 1 | `facility.view` | mutations | org | — | no PHI | n/a |
| Staff | 1 | `staff.view` | invite/credential | org | assignment labels | minimize contact on list | n/a |
| Access / settings | 1 | assign_access / org.manage | role changes | org | optional | — | n/a |

---

## Clinical (deferred)

| Module | Level | Audit | Patient scope | Notes |
|---|---|---|---|---|
| P02 Patients | 2 | registration events | patient | print card = export control |
| P03 Appointments / queues | 2 | status transitions | patient + visit | queue boards minimize diagnosis |
| P04 Clinical | 3 | full clinical audit | encounter | SECURITY_REVIEW |
| P05 Pharmacy | 3 | dispense / adjust | patient + Rx | labels = print restriction |
| P06 Lab / imaging | 3 | result release | patient + order | critical alerts |
| P07 Billing | 2 | payments | patient account | financial export rules |

Screens requiring **SECURITY_REVIEW** before UI: all P04; P06 result entry/critical alerts; P05 clinical review / substitution; any print of clinical content.

---

## Detail-page protections (future)

- Confirm org (and facility where required) on every loader  
- No cross-tenant IDs in URLs without server-side ownership checks  
- Separate list vs detail field sets  
- Print/export explicit permission + watermarking TBD
