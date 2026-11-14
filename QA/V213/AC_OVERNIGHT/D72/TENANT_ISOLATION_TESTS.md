# Tenant isolation tests

| Surface | Result |
|---|---|
| Reset token | Organization is part of the select and of the patient consume |
| Duplicate candidate | A foreign `organization_id` is not returned |
| Department list | Missing staff fails before a query |
| Facility select | The department service still filters `organization_id` |

Cross-facility persistence was not run. A fake row is not a second stored facility.
