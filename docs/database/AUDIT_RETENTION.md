# Audit events retention

## Scope

`platform.audit_events` is the V5 append-only audit trail. It is platform-owned
(cross-cutting: deployment + organization), with optional BlessBoard
`church_id` / `branch_id` soft references.

## Retention

| Policy | Value |
|--------|--------|
| Default online retention | **400 days** from `created_at` |
| Soft operational target | Keep at least **12 months** of HQ-visible history |
| Maximum metadata size | 8 KiB per event (`metadata_json`) |

## Purge rules (ops only)

- Application code **must not** UPDATE or DELETE audit rows (DB triggers enforce append-only).
- Retention purge is an **operator-run** maintenance task, not a product UI action.
- Purge only rows with `created_at < now() - interval '400 days'`.
- Prefer exporting/archiving older rows before delete when compliance requires longer retention.
- Never purge the current calendar month without an explicit incident ticket.

Example (manual, after archive):

```sql
-- Review count first
SELECT count(*) FROM platform.audit_events
 WHERE created_at < now() - interval '400 days';

-- Ops-only: temporarily disable append-only delete trigger, delete, re-enable.
-- Do not script this into application startup.
```

## What is never stored

- Passwords, password hashes, session tokens, CSRF secrets
- Auth transfer raw tokens / redeem codes
- Full payment instrument data
- Unbounded free-text that may contain donor or member PII beyond allowlisted keys

See `src/platform/services/auditEventService.js` for redaction allowlists.
