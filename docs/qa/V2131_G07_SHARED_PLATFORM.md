# V2.13.1 G07 — shared platform

The shared identity, role, tenant, audit, and session services are already used by BlessBoard and ActiveClinic. This phase did not add a second identity system and did not add a restore tool. `src/platform/ops/restoreTenant.js` stays absent. The offline route still returns 503 and does not write.

## Present in source

| Area | Evidence |
| --- | --- |
| USER_LIFECYCLE | `platformAdminAccountRecoveryService.js` suspends sign-in. `revokeV5Session.js` revokes sessions for a platform identity. |
| ROLES | `platformAdminTeamService.js` invites a team member and revokes a role. Church and facility assignment stay on the existing staff and member services. |
| TENANT_CONFIGURATION | `organizationProductService.js` enables and suspends a product. Announcements store a timezone. Billing amounts stay in minor units with a currency code. Website theme changes stay draft until publish. |
| AUDIT | `sanitizeAuditMetadata` drops password, password hash, and OTP values. Audit lists require an organization id. |
| REPORTING | ActiveClinic revenue summaries and BlessBoard scheduled reports already exist. They were not executed. |
| DATA_EXPORT | `runDataJobExport` builds a product export through a registered adapter. No export was run. |
| SECURITY | A matching password may reuse an identity. A mismatch or two identities for one registration is rejected. Appointment updates fail with `stale_version`. CSRF checks remain on the foundation server. Media uploads stay fail-closed. |

## Not demonstrated

Backup restoration, disaster recovery, and offline operation were not run. The offline page is a held route, not a verified offline mode. No monitoring or downtime procedure was executed.

Existing HTTP and browser gates were left closed. No new gated file was added, because the current authorization suites already cover identity, OTP, and appointment conflicts.

```
FINAL=V2131_G07
USER_LIFECYCLE=PRESENT
ROLES=PRESENT
TENANT_CONFIGURATION=PRESENT
AUDIT=PRESENT
REPORTING=PRESENT_NOT_RUN
DATA_EXPORT=PRESENT_NOT_RUN
SECURITY=PRESENT
OPERATIONAL_READINESS=NOT_DEMONSTRATED
SAFE_TESTS_PASSED=464
SAFE_TESTS_FAILED=0
BLOCKERS=HTTP and browser NOT_RUN; backup, restore, and offline mode were not demonstrated; G08 prompt was not in this request
```
