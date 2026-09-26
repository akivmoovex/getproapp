# V2.03 — Shared Platform Foundation

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_PLATFORM_SHARED_FOUNDATION` |
| **Date** | 2026-09-26 |
| **Branch** | `V10` |
| **Based on** | [`ACTIVECLINIC_BATCH1_IMPLEMENTATION_AUDIT.md`](./ACTIVECLINIC_BATCH1_IMPLEMENTATION_AUDIT.md) |
| **Scope** | Shared technical infrastructure only — **no AC screen implementation** |
| **Verdict** | **`V2_03_PLATFORM_FOUNDATION_COMPLETE_WITH_GAPS`** |

---

## 1. Purpose

Deliver the cross-product technical primitives ActiveClinic Batch 1 needs that BlessBoard can also reuse — without erasing domain boundaries or inventing a giant generic entity model.

Products supply **adapters / configuration** (`entity_key`, `subject_ref`, channel handlers). Platform owns mechanisms (scope, jobs, history helpers, list query, UI shells).

---

## 2. Boundary (enforced)

### Common platform (this work)

| # | Capability | Action taken |
|---|------------|--------------|
| 1 | Authorization / RBAC helpers | **REUSED** `src/platform/rbac/*` |
| 2 | Tenant / org / facility scope | **REUSED** `rejectForgedTenantIdentifiers`, AC/BB scope asserts; wired into new consent/jobs/notifications |
| 3 | Audit / event history | **EXTENDED** catalogue keys for data jobs, policy, preferences, notifications |
| 4 | Status-history primitive | **CREATED** `src/platform/history/` (JSON append + transition check; products keep tables) |
| 5 | Search / filter / pagination | **LIFTED** church helper → `src/platform/http/listQuery.js`; church re-exports |
| 6 | Validation / error contracts | **REUSED** `src/platform/validation`, `sharedApiError` |
| 7 | Consent / communication prefs (safe common only) | **CREATED** prefs + policy acceptances; registration T&Cs **reused** |
| 8 | Notification abstraction | **CREATED** channel registry + dispatch (noop without adapter) |
| 9 | Export / import job primitives | **CREATED** `platform.data_jobs` + service/adapters |
| 10 | Reusable UI components | **CREATED** `views/platform/partials/gp-ops-*.ejs` |
| 11 | Activity timeline | **CREATED** `src/platform/timeline/` composer |
| 12 | Responsive form/table/card patterns | **CREATED** `public/platform/gp-ops-shared.css` |

### ActiveClinic-owned (not implemented here)

- Patients, encounters, clinical notes, appointments, clinical workflows
- Health-specific / treatment consent semantics (ACN11 clinical ledger)
- Invoices, cashier, statutory receipt domain logic
- ACN screen routes / Stitch visual parity

### BlessBoard-owned (not implemented here)

- Members, visitors, pastoral care, attendance, ministries
- Church member import mappers (may later register a `bb.members` job adapter)
- BB design-system chrome (`bb-ds-*`) — ops partials are `gp-ops-*` only

---

## 3. Security rules

1. **Trusted scope only** — `organizationId` / `facilityId` / `branchId` come from auth / host context.
2. **Never trust** tenant or facility IDs from request bodies/query for authorization.
3. New write paths call `rejectForgedTenantIdentifiers` with `allowMatchingTrusted` where echo of trusted IDs is harmless.
4. Data job rows are always filtered by `organization_id` from trusted scope.
5. Communication preferences and policy acceptances use opaque `subject_kind` + `subject_ref` — **no patient/member FKs**.

---

## 4. Artifacts

### Migration

- `db/migrations/platform/043_shared_data_jobs_and_preferences.sql`
  - `platform.data_jobs`
  - `platform.data_job_events` (append-only status trail)
  - `platform.communication_preferences`
  - `platform.policy_acceptances`

Not applied to production by this commit.

### Modules

| Module | Path |
|--------|------|
| Status history | `src/platform/history/` |
| List query | `src/platform/http/listQuery.js` |
| Church pagination re-export | `src/church/adminListPagination.js` |
| Consent / prefs | `src/platform/consent/` |
| Notifications | `src/platform/notifications/` |
| Data jobs | `src/platform/jobs/` |
| Timeline | `src/platform/timeline/` |
| Audit catalogue | `src/platform/audit/sharedAuditCatalog.js` |
| Ops CSS | `public/platform/gp-ops-shared.css` |
| Ops partials | `views/platform/partials/gp-ops-*.ejs` |

### Tests

- `tests/v2-03-platform-shared-foundation.test.js`

---

## 5. Adapter model (no generic entity)

```text
registerDataJobAdapter({
  productCode: 'activeclinic' | 'blessboard',
  entityKey: 'ac.patients' | 'bb.members' | ...,  // product-owned string
  jobKinds: ['import','export'],
  previewImport?, commitImport?, buildExport?
})
```

Platform stores `entity_key` as text. It does **not** define a shared Patient/Member table or polymorphic entity registry.

Notifications:

```text
registerNotificationChannel('email', async (envelope) => ({ delivered: true }))
dispatchNotification({ productCode, organizationId, channel, templateKey, recipientRef, trusted })
```

---

## 6. Known gaps (intentional)

| Gap | Why deferred |
|-----|----------------|
| No AC/BB product job adapters registered | Domain mappers belong to ACN26 / BB import waves |
| No clinical consent ledger | Health-specific; AC-owned (ACN11) |
| No background worker for data jobs | Shell only; products/workers wire later |
| No product routes mounting ops CSS/partials | Screen implementation is out of scope |
| Notification channels default to noop | Products plug email/SMS adapters when ready |
| Timeline is a composer, not a store | Domain events stay in product tables / audit |

These gaps are why the verdict is **COMPLETE_WITH_GAPS** rather than a blanket PASS claiming full Batch 1 readiness.

---

## 7. How Batch 1 should consume next

1. ACN26 — register `ac.*` import/export adapters on `createDataJob` / `transitionDataJob`.
2. ACN10/16/21 lists — `parseListQuery` + `gp-ops-table` / pagination partials.
3. ACN08/15/16 — `buildStatusHistoryEntry` / timeline composer over existing AC event tables.
4. ACN11 — keep clinical consent in ActiveClinic; use `policy_acceptances` / prefs only for non-clinical marketing/transactional opt-in if needed.
5. ACN01 — continue platform onboarding engine (already present).

---

## 8. Verdict

**`V2_03_PLATFORM_FOUNDATION_COMPLETE_WITH_GAPS`**

Shared technical foundation for Batch 1 is in place on `V10` with reuse-first RBAC/audit/validation, new job/preference/history/list/timeline/UI primitives, focused tests, and explicit product-boundary gaps documented above.
