# V2.02 ActiveClinic RBAC Alignment QA

**Task:** `V2_02_AC_RBAC_ALIGNMENT`  
**Date:** 2026-09-26  
**Branch:** `V9`  
**Prerequisite:** `V2_02_PLATFORM_RBAC_FOUNDATION_PASS`  
**Production:** **DO NOT TOUCH**

---

## Verdict

### **`V2_02_AC_RBAC_ALIGNMENT_PASS`**

ActiveClinic continues to use the **shared platform RBAC catalogue** (`blessboard.roles` / `permissions` / `role_permissions`) with **AC-owned** `staff_role_assignments` and org/facility scope. No BlessBoard-style legacy `user_roles` were introduced.

Owner decision for `activeclinic.patient.create` is enforced in the **catalogue** (migration `115` + `PATIENT_CREATE_*` policy helpers). Routes still authorize by **permission key + scope only** — no role-name allowlists in HTTP handlers.

Local DB tests **PASS**. Production untouched.

---

## 1. Shared foundation (confirmed)

| Layer | Owner | Notes |
| --- | --- | --- |
| Role / permission catalogue | Platform (`blessboard.*` until Phase F) | `platform/rbac` lookup + effective-permission helpers |
| Staff assignments | ActiveClinic | `activeclinic.staff_role_assignments` |
| Scope | ActiveClinic + shared tenant helpers | Organisation vs facility; cross-facility / cross-org deny |
| HTTP authz | Permission middleware | `authorizeStaffPermission` / patient service checks `activeclinic.patient.create` |

---

## 2. Owner decision — `patient.create` families

| Family | Role keys | Create | View |
| --- | --- | --- | --- |
| Reception | `activeclinic_receptionist` | Yes | Yes |
| Clinical / records | `activeclinic_medical_records_officer` | Yes | Yes |
| Clinic management | `activeclinic_clinic_manager` | Yes | Yes |
| Organization management | `activeclinic_organization_admin`, `activeclinic_network_admin` (compat) | Yes | Yes |
| Clinical ops (nurse/clinician) | `activeclinic_nurse`, `activeclinic_clinician` | **No** (keep view; quick_register separate) | Yes |
| Facility admin | `activeclinic_facility_admin` | **No** | Yes |
| Billing / finance / cashier | billing_officer, finance_supervisor, cashier | **No** | (as previously mapped) |
| Lab / radiology / pharmacy | lab_technician, radiology_staff, pharmacist | **No** | Yes (patient.view) |
| Website editor / bare staff / auditor | website_editor, staff, auditor | **No** | — |

Policy constants: `PATIENT_CREATE_ROLE_FAMILIES` / `PATIENT_CREATE_ALLOWED_ROLE_KEYS` in `platformRbacConstants.js`.  
Catalogue audit: `auditActiveClinicPatientCreateGrants`.

---

## 3. Implementation surfaces

| Change | Path |
| --- | --- |
| Catalogue grant/strip | `db/migrations/blessboard/115_activeclinic_patient_create_v202_alignment.sql` |
| Policy families | `src/platform/rbac/platformRbacConstants.js` |
| Catalogue audit helper | `src/platform/rbac/platformRbacCatalogService.js` |
| Routes | Unchanged — still check `activeclinic.patient.create` |
| Self-elevation | Existing `canGrantRole` → `SELF_ESCALATION` for org-admin self-grant |

---

## 4. Test matrix

| Case | Expected | Evidence |
| --- | --- | --- |
| Receptionist | Allow create | Alignment + registration RBAC |
| Medical records officer | Allow create | Alignment |
| Clinic manager | Allow create | Alignment + matrix MUST_HAVE |
| Org admin | Allow create | Alignment + matrix MUST_HAVE |
| Nurse | View yes, create no | Alignment |
| Billing / finance / website / lab / radiology / facility admin / staff | Deny create | Alignment |
| Facility scope | Receptionist A cannot register at facility B | Alignment |
| Cross-clinic | Org A staff cannot register in org B | Alignment |
| Direct API `/app/patients/new` | 200 receptionist / 403 billing | Alignment |
| Self-elevation | Org admin cannot grant org admin to self | Alignment (`SELF_ESCALATION`) |
| Catalogue integrity | Exact allowed set only | `auditActiveClinicPatientCreateGrants` |

**Commands:**

```bash
node --test tests/v2-02-ac-rbac-alignment.test.js
node --test tests/activeclinic-rbac-role-matrix.test.js
node --test tests/v2-02-platform-rbac-foundation.test.js
```

---

## 5. Production

- **Not deployed.** Migration `115` is V9-only until an explicit non-prod promote.
- Do not apply to production in this task window.
