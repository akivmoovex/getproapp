# V2.13.1 G11 — tenant, facility, and permission isolation

The G01–G08 code that writes clinical data keeps the organization on the SQL predicate.

| Surface | Boundary |
| --- | --- |
| Encounter close | `organization_id`, `facility_id`, and `status = 'open'` |
| Laboratory fulfillment | Existing request lookup is `clinical_order_id` plus `organization_id` |
| Pharmacy handoff | Catalogue lookup is `organization_id` and `healthcare_organization_id` |
| Laboratory result | Request lookup includes organization, healthcare organization, and facility |
| Documents | View permission plus organization and facility |
| Clinical queue | `activeclinic.encounter.view` and the clinical department |
| Laboratory queue | Laboratory view permission and the laboratory department |
| Pharmacy | `activeclinic.pharmacy.view` and the pharmacy department |
| Billing | Billing permissions. Receptionist denial is already in the Playwright spec and was not run |
| Migration inventory | `openMigrationBatch` requires organization, facility, and staff ids. It is not imported by an HTTP route |

BlessBoard source is still barred from reading `activeclinic.patients` by the existing D34 contract. No new BlessBoard path was added.

`activeClinicRecordMigrationService` does not authorize a role by itself. It must not be mounted on a route until a permission check is added. This phase did not mount it.

Unauthorized export, edit, and delete of another tenant were not executed. The new migration contains no `DELETE FROM`.

```
TENANT_ISOLATION_GAPS=HTTP and browser denial checks NOT_RUN; migration service is unrouted and has no role check of its own
```
