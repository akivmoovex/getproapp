# ActiveClinic QA role users

**TESTING / DEMO ONLY — NEVER USE IN PRODUCTION**

Standardized QA accounts for manual ActiveClinic role testing on
`activeclinic-demo` (ActiveClinic Demo Centre).

These accounts are **separate** from the departmental demo seed users
(`reception@…`, `doctor@…`, etc.) and from `demo.admin@activeclinic.example`.

## Seed command

```bash
scripts/local/run-with-blessboard-env.sh testing \
  npm run activeclinic:seed-qa-role-users -- --confirm --password=<policy-compliant-secret>
```

Platform identity password policy requires **minimum length 10**.

The brief requested password `12345678` is **rejected** by existing policy.
Do not weaken validation. Use any compliant shared QA secret (recommended
smallest compliant example: `1234567890`).

Optional:

```bash
--reset-passwords   # force password reset on existing QA identities
--dry-run           # plan only (default without --confirm)
```

Guards:

* testing/demo `environment_code` only
* `DATABASE_IDENTITY_EXPECTED` must match
* organization key must be `activeclinic-demo`
* refuses production

## Shared QA password

Shared QA password configured through testing-only QA seed command
(`--password=…`). Do not commit production secrets.

## Accounts

| Username | Email | Role | Scope | Expected modules | Forbidden (examples) |
| -------- | ----- | ---- | ----- | ---------------- | -------------------- |
| demo_organization_admin | demo_organization_admin@demo.activeclinic.example | organization_admin | organisation | admin, facilities, staff, Roles & Access, read ops | clinical write, dispense, lab/rad result, collect/refund |
| demo_network_admin | demo_network_admin@demo.activeclinic.example | network_admin | organisation | same as org admin (**LEGACY / COMPATIBILITY**) | clinical write |
| demo_facility_admin | demo_facility_admin@demo.activeclinic.example | facility_admin | facility | facility admin, staff/schedules | clinical write, dispense, diagnostics write, finance tx |
| demo_clinic_manager | demo_clinic_manager@demo.activeclinic.example | clinic_manager | facility | operational/read oversight | refund, clinical/finance writes |
| demo_receptionist | demo_receptionist@demo.activeclinic.example | receptionist | facility | Patients, Appointments, Reception | clinical, pharmacy, diagnostics, cashier, access |
| demo_nurse | demo_nurse@demo.activeclinic.example | nurse | facility | patients, triage, nursing | consultation.sign, dispense, billing, access |
| demo_clinician | demo_clinician@demo.activeclinic.example | clinician | facility | Patients, Appointments, Clinical | dispense, cashier, access |
| demo_pharmacist | demo_pharmacist@demo.activeclinic.example | pharmacist | facility | Pharmacy | diagnosis write, cashier, access |
| demo_lab_technician | demo_lab_technician@demo.activeclinic.example | lab_technician | facility | Diagnostics (Laboratory) | Radiology, clinical, finance |
| demo_radiology_staff | demo_radiology_staff@demo.activeclinic.example | radiology_staff | facility | Diagnostics (Radiology) | Laboratory, pharmacy, finance |
| demo_billing_officer | demo_billing_officer@demo.activeclinic.example | billing_officer | facility | Billing | refund, reverse, cashier ops |
| demo_cashier | demo_cashier@demo.activeclinic.example | cashier | facility | Cashier | refund, reverse, override |
| demo_finance_supervisor | demo_finance_supervisor@demo.activeclinic.example | finance_supervisor | facility | Billing, Cashier, elevated finance | clinical, pharmacy, access |
| demo_auditor | demo_auditor@demo.activeclinic.example | auditor | organisation | read-only modules | all transactional writes |
| demo_staff | demo_staff@demo.activeclinic.example | staff | organisation | Dashboard / Settings | patient.create and ops writes |

## Notes

* Exactly one target role per QA user.
* Facility-scoped users use the Demo primary Lusaka facility.
* Org-scoped users still receive Demo facility membership for UI context.
* Patient merge remains unassigned / unavailable.
* Do not use these identities outside testing.
