# Design decision register

Source: `QA/V213/AC_OVERNIGHT/D29/DESIGN_APPROVAL_REGISTER.md` and `QA/V213/AC_OVERNIGHT/D21/CLINICAL_DESIGN_APPROVALS.md`. HEAD `b8f6b420d25e908de64ba292866c218c32edc30c`. All 18 are pending. None is approved by this stage.

| ID | Decision | Status | Owner | Depends on | Implementation risk if started early |
|---|---|---|---|---|---|
| D21-01 | Clinical role matrix | PENDING | ActiveClinic | D21-15 | A wider role could make AC-05 look closed or give a cashier reversal |
| D21-02 | Encounter states | PENDING | ActiveClinic | None | Renaming `open`, `completed`, `cancelled` would break queue, notes, and orders |
| D21-03 | Merge, lineage, unmerge | PENDING | ActiveClinic | D21-04 | An automatic merge would reparent clinical rows |
| D21-04 | Missing phone and national ID | PENDING | ActiveClinic | None | A guessed identifier could link the wrong portal |
| D21-05 | Appointment capacity | PENDING | ActiveClinic | None | A lock added without a capacity number would change current booking |
| D21-06 | Critical-result escalation | PENDING | ActiveClinic | D21-02 | A timer would page on the newest alert, which is not the result id |
| D21-07 | Pharmacy substitution | PENDING | ActiveClinic | None | Using the existing columns would look like an approved substitute |
| D21-08 | Billing reversal and payment home | PENDING | ActiveClinic. Shared Platform only if primitives move | D21-01 | Moving payments or giving reversal to the cashier changes the catalogue |
| D21-09 | Retention and disposal | PENDING | ActiveClinic, with legal and privacy owners | None | Any period chosen here would be an unapproved legal rule |
| D21-10 | Hosting, backup, RPO/RTO | PENDING | Shared Platform | None | A restore without a tenant check can load one tenant into another |
| D21-11 | OTP provider and migration | PENDING | Shared Platform | D21-04 for the patient channel | Activating delivery, or accepting `1234` in production, bypasses the hold |
| D21-12 | Break-glass | PENDING, deferred | ActiveClinic | D21-15 | A bypass would skip the AC-05 denial |
| D21-13 | Juflona signing | PENDING, deferred | ActiveClinic | D29-16 | A demo tenant could turn signing on for every clinic |
| D21-14 | V2.12 portal pass reuse | PENDING | ActiveClinic | None | The missing output directory would be treated as `PAT-01-01` evidence |
| D21-15 | What closes AC-05 | PENDING | ActiveClinic | None | The cashier referral 403 would be accepted as the admin denial |
| D29-16 | Consent representative, witness, and disclosure | PENDING | ActiveClinic | None | New consent types or a representative rule would be policy, not a bugfix |
| D29-17 | Allergy review before dispense | PENDING | ActiveClinic | D21-07 | A dose or drug block would be a prescribing rule |
| D29-18 | Accessibility, monitoring, and SLO numbers | PENDING | ActiveClinic for screens. Shared Platform for monitors, host, and numbers | D21-10, D21-06, D21-11 | Publishing a number or a monitor would look like a release claim |

Current code that these decisions must not be read as accepting:

- Encounters stay `open`, `completed`, `cancelled`.
- `activeclinic.patient.merge` is assigned to nobody.
- Payment reversal is on the finance supervisor list, not the cashier list.
- OTP activation is blocked. The uncommitted module is not the committed baseline.
- Consent types and `guardian_*` capture methods exist. They are not an approved representative or disclosure policy.
- Triage allergies are free text.
