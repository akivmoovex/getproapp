# Tenant and facility changes

Facility reads in `facilityRepository.js` were already limited by `organization_id`. These paths were not, and now are.

| Path | Change |
|---|---|
| Open encounter list | Also matches `e.organization_id` |
| Nursing intake list | Also matches organization and facility |
| Vital-sign list | Also matches organization and facility |
| Triage read and update | Also matches `organization_id` |
| Draft consultation read and update | Also matches `organization_id`, and the update still requires `status = 'draft'` |
| Consultation sign | Loads and updates only a note in the caller's organization. A miss returns `consultation_not_found` |
| Queue number allocation | Locks `service_points` only when `id` and `organization_id` match. No row returns no number |
| Active queue count | Also matches `organization_id` |

Department create already resolved the facility with `id` and `organization_id`. That path was not changed.

BlessBoard source still has no query of `activeclinic.patients`.

Note text is trimmed to the lengths already stored in the table checks: 5000 for the four SOAP fields and 3000 for additional notes. History stays 8000. Medication, follow-up, and referral stay 4000.
