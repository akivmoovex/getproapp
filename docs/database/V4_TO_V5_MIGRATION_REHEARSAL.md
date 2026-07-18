# V4 → V5 migration rehearsal report

**Generated:** 2026-07-18T09:00:38.752Z
**Verdict:** PASS
**Environment:** local fixture databases only (no hosted DB)

## Databases

| Role | Database | Identity |
|------|----------|----------|
| Source (V4) | `blessboard_v4_rehearsal` | n/a (legacy shape) |
| Target (V5) | `blessboard_v5_rehearsal` | `blessboard-platform-v5` |

## Timing

| Step | Duration ms |
|------|-------------|
| createDatabases | 426 |
| seedV4 | 44 |
| initV5 | 256 |
| plan | 22 |
| dryRun | 26 |
| apply | 72 |
| verify | 4 |
| applySecond | 30 |
| smoke | 6 |
| rollback | 2 |
| **total** | **917** |

## Source counts

```json
{
  "tenants": 2,
  "organizations": 3,
  "branches": 3,
  "domains_host_slug": 3,
  "hq_admins": 2,
  "branch_admins": 2,
  "members": 5,
  "ministries": 2,
  "events": 2,
  "announcements": 2,
  "attendance": 3,
  "giving": 2,
  "audit": 2
}
```

## Migrated (target) counts

```json
{
  "organizations": 2,
  "enrolments": 2,
  "domains": 3,
  "churches": 2,
  "branches": 3,
  "users": 5,
  "roles": 4,
  "members": 4,
  "memberships": 4,
  "ministries": 2,
  "events": 2,
  "announcements": 2,
  "attendance_events": 3,
  "giving_entries": 2,
  "audit_events": 2,
  "public_tenants": 0,
  "public_session": 0
}
```

## Count reconciliation

| Entity | Source | Expected eligible | Migrated | Quarantine/skip expected | Result |
|--------|--------|-------------------|----------|--------------------------|--------|
| organizations | 3 | 2 | 2 | 1 | PASS |
| churches | 2 | 2 | 2 | 0 | PASS |
| branches | 3 | 3 | 3 | 0 | PASS |
| domains | 3 | 3 | 3 | 0 | PASS |
| members | 5 | 4 | 4 | 1 | PASS |
| ministries | 2 | 2 | 2 | 0 | PASS |
| events | 2 | 2 | 2 | 0 | PASS |
| announcements | 2 | 2 | 2 | 0 | PASS |
| attendance | 3 | 3 | 3 | 0 | PASS |
| giving | 2 | 2 | 2 | 0 | PASS |
| audit | 2 | 2 | 2 | 0 | PASS |

## Dry-run / apply totals

```json
{
  "dryRun": {
    "accepted": 29,
    "skipped": 1,
    "conflicts": 0,
    "quarantined": 2,
    "wouldWrite": 29,
    "written": 0
  },
  "apply": {
    "accepted": 29,
    "skipped": 1,
    "conflicts": 0,
    "quarantined": 2,
    "wouldWrite": 0,
    "written": 29
  },
  "applySecond": {
    "accepted": 0,
    "skipped": 30,
    "conflicts": 0,
    "quarantined": 2,
    "wouldWrite": 0,
    "written": 0
  }
}
```

## Conflicts

Conflict count (apply): **0**

No unexpected conflicts.

## Skipped / unresolved

Skipped count (apply): **1**

Expected unresolved (quarantine) source IDs / reasons:

```json
{
  "organizations": [
    {
      "slug": "BAD ORG!",
      "reason": "invalid_slug"
    }
  ],
  "members": [
    {
      "full_name": "No Contact Person",
      "reason": "missing_contact"
    }
  ],
  "media_group": [
    {
      "reason": "media_blob_copy_deferred"
    }
  ]
}
```

## Transformed fields (sample)

```json
{
  "organization": {
    "slug": "grace-chapel",
    "organizationKey": "grace-chapel",
    "planKey": "growth",
    "dataEnvironment": "pilot"
  },
  "member": {
    "statusMap": "verified→active",
    "contact": "email_normalized lowercased",
    "password": "not_copied_to_users"
  },
  "giving": {
    "cents": 125050,
    "amount": "1250.50",
    "currency": "ZMW"
  },
  "attendance": {
    "recorded": "→ approved attendance_event + entry",
    "void": "→ archived"
  },
  "audit": {
    "action": "member.approved → action_key",
    "metadata": "password stripped"
  }
}
```

## Batch behavior

- Batch size: **25**
- Checkpoints written under: `/Users/akivsolomon/Documents/DocumentsAkiv/Akiv/Dev/CursorProjects/getpro/tmp/migration-v4-to-v5/rehearsal/state`
- Groups completed: platform_identity:verified_identity, products_enrolments_domains:ok, churches_branches_settings:ok, users_roles:ok, members:ok, public_content:ok, operational_modules:ok, media_metadata:skipped_group, audit_reconciliation:ok

## Idempotency

Second apply written: **0** (expect 0)
Second apply skipped: **30**
Idempotency: **PASS**

## Application smoke tests

| Test | Result | Detail |
|------|--------|--------|
| church_linked | PASS | churches=1 |
| list_branches | PASS | activeCount=2 |
| active_branches_count | PASS | n=2 |
| auth_rejects_wrong_password | PASS | invalid_credentials |
| hq_user_migrated | PASS | users=1 |
| hq_role_assigned | PASS | church_hq_admin |
| entitlements_active | PASS | growth |
| growth_no_custom_domain | PASS | expected false on growth |
| members_migrated_for_grace | PASS | n=3 |
| giving_approved_total | PASS | total=1250.50 |
| no_public_tenants_session | PASS | n=0 |

## Rollback rehearsal

```json
{
  "ok": true,
  "before": 0,
  "after": 0,
  "rolledBack": true,
  "error": "forced_batch_failure"
}
```

## Failures / blockers

None — rehearsal completed without unexpected count mismatches or data loss.

## Notes

- Mapping rules were not weakened to force green results.
- Invalid org slug `BAD ORG!` and member without contact are intentional quarantines.
- Media blob copy remains deferred (group skipped by design).
- Source DB was never updated or deleted by the migrator.
