# V8 Shared Platform Audit Logging

**Status:** Active  
**Branch:** `V8`  
**Tables:** `platform.audit_events` (append-only), `platform.website_audit_events`  
**Modules:** `src/platform/audit/`, `src/platform/services/auditEventService.js`

## Goals

1. Consistent audit events for BlessBoard and ActiveClinic with actor, action, product, tenant, target, timestamp, and outcome.
2. Preserve branch (`branch_id`) and facility (`facility_id`) scope.
3. Redact passwords, OTPs, tokens, secrets, and unnecessary patient/clinical data.
4. Restrict audit-log reads via platform-admin or audit view permissions.
5. Critical security mutations must not silently succeed when the audit write fails.
6. Additive schema only — existing V7 rows and consumers stay valid.

## Event model

| Field | Storage |
|-------|---------|
| Actor | `actor_user_id` + metadata `actor_type` / `actor_identity_id` |
| Action | `action_key` (catalog in `sharedAuditCatalog.js`) |
| Product | `product_code` (nullable additive column) + metadata |
| Tenant | `organization_id`, optional `church_id` / `branch_id` / `facility_id` |
| Target | `entity_type` + `entity_id` |
| Timestamp | `created_at` |
| Outcome | `success` \| `failure` \| `denied` |

Website draft/publish/restore detail remains in `platform.website_audit_events`. High-level platform mirrors use keys such as `website.published` / `website.restored` — do not double-write identical payloads into both tables from the same call path.

## Writers

| API | Behavior |
|-----|----------|
| `recordSharedPlatformAudit` | Best-effort (savepoint); never throws |
| `recordCriticalPlatformAudit` | No savepoint; failure returns `ok:false` for security paths |
| `recordAuditEvent` / `recordAuditEventSafe` | Existing V7 service (extended redaction + product/facility) |
| `recordLifecycleAudit` | Registration lifecycle → shared facade |

## Access control

`authorizeAuditLogAccess` / `listSharedPlatformAuditEvents` allow:

- Platform admins (`isPlatformAdmin: true`)
- Permissions: `platform.audit.view`, `organization.audit.view`, `audit.view`, `hq.audit.view`

Tenant mismatch → denied.

## Retention & access requirements

| Requirement | Policy |
|-------------|--------|
| Retention (testing) | Disposable fixtures only; testing resets may purge org-scoped rows via controlled tools |
| Retention (production) | Minimum **24 months** online; longer archival per legal hold |
| Immutability | UPDATE/DELETE blocked by DB triggers |
| Access | Platform Admin and roles with audit view permissions; tenant-scoped listing |
| Export | Operator-controlled; never include redacted secret keys |
| Patient data | Store identifiers such as `patient_number` only when operationally required — never clinical notes, diagnoses, or contact PII in metadata |

## Migration

`db/migrations/platform/037_audit_events_product_facility.sql` — nullable `product_code`, `facility_id`.

## Tests

```bash
node --test --test-concurrency=1 tests/v8-shared-audit-logging.test.js
npm run test:v8:regression
```
