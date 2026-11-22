# V13 G32 — platform and operations

Shared identity, invitations, role revocation, session revocation, CSRF, tenant filters, audit redaction, and appointment `stale_version` are present and were not weakened. Public booking stays disabled in the V13 fixture contract. No new feature flag was added.

Reporting services exist for ActiveClinic revenue and BlessBoard scheduled reports. They were not executed, and this phase did not add a report that exposes another tenant’s patients.

Data export exists as `runDataJobExport` and was not run. Offline mode is still a 503 page that does not write. `src/platform/ops/restoreTenant.js` is still absent. Backup, restore, monitoring, and accessibility were not demonstrated, so they are not claimed.

External national systems, insurance, and inpatient modules stay deferred. Juflona signing stays off by default.

```
SECURITY_AND_AUDIT=IMPLEMENTED_UNVERIFIED
REPORTING=NOT_DEMONSTRATED
```
