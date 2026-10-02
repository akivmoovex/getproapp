# ActiveClinic V7 — Implementation Completeness

**Generated:** 2026-08-12T12:27:59.412Z
**Branch:** V7
**SHA:** 082b5712944d91b23502cb7b61f2cad98969e2a7
**Environment:** testing / moovex-platform-v7
**Phase 16:** Inventory integrity evidence pass

This report separates **implementation completeness** from **visual fidelity**.
Visual scores belong in `ACTIVECLINIC_V7_VISUAL_BACKLOG.*`, not here.

## Summary

| Classification | Count |
|---|---:|
| Exact | 103 |
| Multiple Stitch → one implementation | 247 |
| One Stitch → multiple implementations | 11 |
| **Full (combined)** | **361** |
| Partial | 0 |
| Not implemented | 0 |
| Product decision | 9 |
| Duplicate / variant | 8 |
| N/A | 10 |
| Ambiguous | 0 |

## Fully implemented

361 screens map to functional V7 routes/views.

## Partial implementation

None. Target met.

## Not implemented

None. Target met.

## Product decisions

### P07 – Insurance Payment Placeholder

- **ID:** 9c0219d791da43df8a7abf41cf0809df
- **V7 routes:** (none)
- **Decision:** Explicit placeholder / intentionally not built in V7

### P07 – NHIMA Claim Placeholder

- **ID:** 0489fa5d1c37481ba159eeed1cd64155
- **V7 routes:** (none)
- **Decision:** Explicit placeholder / intentionally not built in V7

### P07 – Write-Off Request Placeholder

- **ID:** 46a8b6c4f4b846e18ab586c3d6fae6ca
- **V7 routes:** (none)
- **Decision:** Explicit placeholder / intentionally not built in V7

### P13 – Phone Verification

- **ID:** 1db2777e1f444a0a90ca3174a4700ac2
- **V7 routes:** /activate/:token
- **Decision:** Staff activation uses password set; patient verify-phone is separate portal flow

### P13 – Role Permission Matrix – Desktop

- **ID:** 6b9cfcd190e14155ac4390d66d0cff76
- **V7 routes:** /app/access?tab=catalogue, /app/access/roles/:roleKey
- **Decision:** V7 uses fixed ActiveClinic role catalogue with capability-group summaries and role detail pages. Stitch role×permission matrix editor is intentionally not built — roles are system-defined, not custom-editable.

### P25 - Juflona Booking - Procedure Slot - Desktop

- **ID:** 8c52142a20484c39928c8f3355174384
- **V7 routes:** /clinics/:clinicKey/book/procedures/:procedureKey
- **Decision:** V7 uses preferred datetime field; Stitch shows live selectable slot grid. Live slots explicitly not published online.

### P25 - Juflona Booking - Procedure Slot - Mobile

- **ID:** 3f05000a252b4732952b7dcbd70a9c06
- **V7 routes:** /clinics/:clinicKey/book/procedures/:procedureKey
- **Decision:** V7 uses preferred datetime field; Stitch shows live selectable slot grid. Live slots explicitly not published online.

### P25 - Juflona Booking - Referral and Upload States - Mobile

- **ID:** ef1d0961e88e43549af5361a5fb9320c
- **V7 routes:** /clinics/:clinicKey/book/procedures/:procedureKey/referral
- **Decision:** Stitch shows referral upload UI states; V7 has no secure public upload storage — honesty banner only

### P26 - Juflona Booking - Booking Changed During Request - Mobile

- **ID:** ca7cdd02f84f4a13abb5b324f3fb453f
- **V7 routes:** /clinics/:clinicKey/my-booking
- **Decision:** V7 reloads current booking status on each request. Stitch mid-request conflict UX (booking changed while editing) is intentionally not built; cancel/reschedule operate on current server state.

## Duplicate / reference variants

8 duplicate Stitch variants.

## No implementation required

10 pattern/taxonomy/component boards.

## Ambiguous

None. Target met.

## Functional area coverage

| Area | Full | Partial | Missing | Other | Total |
|---|---:|---:|---:|---:|---:|
| APP_SHELL | 9 | 0 | 0 | 4 | 13 |
| APPOINTMENTS | 12 | 0 | 0 | 0 | 12 |
| BILLING | 60 | 0 | 0 | 3 | 63 |
| CASHIER | 10 | 0 | 0 | 0 | 10 |
| CLINIC_REGISTRATION | 10 | 0 | 0 | 0 | 10 |
| CLINICAL | 12 | 0 | 0 | 0 | 12 |
| CONSULTATION_BOOKING | 18 | 0 | 0 | 0 | 18 |
| DASHBOARD | 2 | 0 | 0 | 2 | 4 |
| DIAGNOSTICS | 1 | 0 | 0 | 0 | 1 |
| DIRECTORY | 9 | 0 | 0 | 1 | 10 |
| DOCTORS | 7 | 0 | 0 | 0 | 7 |
| JUFLONA | 25 | 0 | 0 | 0 | 25 |
| LABORATORY | 9 | 0 | 0 | 0 | 9 |
| MY_BOOKING | 33 | 0 | 0 | 2 | 35 |
| PATIENT_AUTH | 15 | 0 | 0 | 0 | 15 |
| PATIENT_PORTAL | 13 | 0 | 0 | 1 | 14 |
| PATIENTS | 18 | 0 | 0 | 0 | 18 |
| PHARMACY | 29 | 0 | 0 | 0 | 29 |
| PRICING | 5 | 0 | 0 | 0 | 5 |
| PROCEDURE_BOOKING | 20 | 0 | 0 | 4 | 24 |
| PUBLIC_PLATFORM | 7 | 0 | 0 | 8 | 15 |
| RADIOLOGY | 4 | 0 | 0 | 0 | 4 |
| RBAC | 4 | 0 | 0 | 1 | 5 |
| RECEPTION | 8 | 0 | 0 | 0 | 8 |
| SERVICES | 11 | 0 | 0 | 0 | 11 |
| SETTINGS | 3 | 0 | 0 | 1 | 4 |
| STAFF | 7 | 0 | 0 | 0 | 7 |

## Unused views (not deleted)

- `views/activeclinic/app/cashier-close-content.ejs`
- `views/activeclinic/booking/procedure-entry.ejs`
