# ActiveClinic Stitch — Data Contracts (Phases 1–7)

**Audited:** 2026-08-04

## Phase 1

| Data | Source | Fabrication allowed? |
|------|--------|----------------------|
| Staff session / org / facility | Real session + loaders | No |
| Dashboard counts | Real infrastructure aggregations only | No clinical KPIs |
| Notifications | Only if real service exists | No fake alerts |

## Phase 2

| Entity | Tables / services | Notes |
|--------|-------------------|-------|
| Patient | `activeclinic` patients migrations 008–011 | Real |
| Identifiers | `patient_identifiers` | Real |
| Emergency contacts | `patient_emergency_contacts` | Real |
| Registrations / facility links | `010_patient_registrations…` | Real |
| Duplicate detection | `activeClinicPatientDuplicateService` | Real |
| Print card | — | PRODUCT_DECISION |
| Medical history fields shown in Stitch | — | Do not invent diagnoses/allergies store without schema |

## Phases 3–7

| Phase | Required domain | Schema status |
|------:|-----------------|---------------|
| 3 | Appointments, visits, queues | **Absent** |
| 4 | Triage, vitals, consult notes, orders | **Absent** |
| 5 | Medicines, stock, prescriptions, dispense | **Absent** |
| 6 | Lab/rad requests, specimens, results | **Absent** |
| 7 | Invoices, payments, cashier shifts, price lists | **Absent** |

Contract: empty/unavailable states only until migrations + services land.
