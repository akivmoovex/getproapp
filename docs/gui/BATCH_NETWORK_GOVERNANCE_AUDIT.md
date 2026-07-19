# BATCH_NETWORK_GOVERNANCE_AUDIT — NW-GOV-01 shipped

**Date:** 2026-07-19  
**Branch:** `V5`  
**Status:** **SHIPPED**  
**Prompt:** 47. IMPLEMENT NETWORK AUDIT AND GOVERNANCE DASHBOARD

## Gate

Presentation and filtering only over existing `platform.audit_events`.  
Export skipped — no safe report-export infrastructure ([`BATCH_FG_REPORT_EXPORTS.md`](./BATCH_FG_REPORT_EXPORTS.md)).

## What shipped

| Item | Detail |
|------|--------|
| Route | `GET /hq/audit/governance` |
| Entitlement | Soft `advanced_audit` — **true** on Network; **false** on Foundation / Growth |
| Storage | Append-only `platform.audit_events` unchanged (no UPDATE/DELETE) |
| Filters | Date from/to · branch · actor (church staff) · action category · outcome |
| Presentation | Truncated refs; no metadata JSON; page outcome counts only |
| Nav | HQ **Governance** → `/hq/audit/governance` |
| Basic audit | `/hq/audit` remains for all HQ packages; links to Governance |

## Privacy

Excluded from views: passwords, tokens, cookies, CSRF, secrets, donor PII, prayer/pastoral `message`/`body`/`notes` (already stripped at write via `sanitizeAuditMetadata`).

## Explicitly omitted

- CSV / bulk export  
- Compliance scores / risk ratings  
- Arbitrary SQL or metadata dump  

## Growth denial

Same route returns **200** with `data-bb-gov-denied="1"` and no event catalog. Standard `/hq/audit` still works on Growth.

## Files

- `db/seeds/003_blessboard_plans.sql` — `advanced_audit` true for Network  
- `src/platform/repositories/auditEventRepository.js` — branch / actor / category / date filters  
- `src/platform/services/auditEventService.js` — validation for new filters  
- `src/blessboard/services/hqReportsService.js` — `resolveChurchAdvancedAudit`  
- `src/blessboard/http/hqReportsRoutes.js` — governance route  
- `views/blessboard/v5/hq/governance-audit.ejs` · `audit.ejs` link  
- `hqAdminNav.js` · `hq-admin.css` (`?v=52`)  
- `tests/blessboard-hq-governance-audit.test.js`

## Tests

```bash
node --test --test-concurrency=1 tests/blessboard-hq-governance-audit.test.js
node --test --test-concurrency=1 tests/platform-entitlements.test.js
git diff --check
```

## Hosted migration

**Seed re-apply** for plan features. No DDL.

## Stop

Governance dashboard only — no export, retention policies, or compliance packs.
