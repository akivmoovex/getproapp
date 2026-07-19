# Foundation Transaction Composability Implementation (Phase 2)

**Date:** 2026-07-19  
**Scope:** Refactor V5 provisioning services for shared-transaction composability.  
**Does not:** implement `provisionRegisteredBlessBoardChurch`, change registration, migrate schema, or provision live applications.

---

## 1. Previous transaction ownership

| Function | File | Own BEGIN/COMMIT? | Accepts client? | Side effects |
|----------|------|-------------------|-----------------|--------------|
| `provisionPlatformTenant` | `src/platform/services/provisionPlatformTenant.js` | Always | Pool or Client | none |
| `provisionBlessBoardChurch` | `src/blessboard/services/provisionBlessBoardChurch.js` | Always | Pool or Client | none |
| `createBlessBoardUser` | `src/blessboard/services/createBlessBoardUser.js` | Always | Pool or Client | bcrypt CPU |
| `assignBlessBoardRole` | `src/blessboard/services/assignBlessBoardRole.js` | Always | Pool or Client | none |
| `assignOrganizationPlan` | `entitlementService.js` | No (caller TX) | Client via `withClient` | none |
| `recordAuditEvent` | `auditEventService.js` | No BEGIN/COMMIT | Pool/Client | append row |
| CLIs | `db/scripts/*-provision.js` | N/A | Pool to services | stdout |

**Verdict before Phase 2:** each step TX-safe alone; **not composable** (inner COMMIT finalized early).

---

## 2. Chosen composability contract (Option A)

```js
await service(db, input);                              // standalone (default)
await service(client, input, { manageTransaction: false }); // composed
```

Rules:

1. `manageTransaction` defaults to **`true`** (CLI/unchanged callers).
2. `manageTransaction: false` requires a **connected client** (has `query` + `release`), not a Pool.
3. Inner services never BEGIN / COMMIT / ROLLBACK / `release` when composed.
4. Invalid combos fail early with `transaction_error` / clear message.

Rejected Option B (`tx` presence) and Option C (dual wrappers) to keep one explicit flag across the chain.

---

## 3. Functions refactored

| Function | Composable? |
|----------|-------------|
| `provisionPlatformTenant` | **Yes** |
| `provisionBlessBoardChurch` | **Yes** |
| `createBlessBoardUser` | **Yes** |
| `assignBlessBoardRole` | **Yes** |
| `assignOrganizationPlan` | Already TX-ready (unchanged API) |
| `recordAuditEvent` | Already client-compatible (no own TX) |

Helper module: `src/platform/db/provisioningTransaction.js`

---

## 4. Standalone behavior

Unchanged for callers:

- Acquire client from Pool when needed  
- BEGIN once  
- COMMIT on success / ROLLBACK on failure or dry-run  
- Release owned client once  
- Same status codes and return shapes  

---

## 5. Composed behavior

With `{ manageTransaction: false }`:

- Use supplied client only  
- No BEGIN / COMMIT / ROLLBACK / release  
- Domain errors returned as before; outer caller owns rollback  
- Early failure returns do **not** roll back the outer TX  

---

## 6. Transaction wrapper behavior

Exports:

- `resolveManageTransactionOption`
- `openProvisioningSession`
- `withProvisioningTransaction(pool, fn)` — outer helper for tests / future orchestrator
- `runInsertWithUniqueRecovery(client, savepoint, insertFn)` — unique-race recovery **without aborting** the outer TX (PostgreSQL requires savepoint after 23505)

Savepoints are used only for insert race recovery (proven need from concurrent provision tests). Not used as nested business transactions.

---

## 7. CLI compatibility

CLIs still call:

```js
await provisionPlatformTenant(pool, input);
await provisionBlessBoardChurch(pool, input);
```

No argument or output-format changes. Dry-run / `--confirm` / exit codes unchanged. Domain and plan behavior unchanged (`skipDomain` deferred to Phase 3).

---

## 8. Audit-event transaction behavior

| Kind | Placement |
|------|-----------|
| Success events describing committed rows | **Inside** the same TX as the writes (compose with client) |
| Provisioning failure status on applications | **Outside** after outer ROLLBACK — **Phase 3** |
| Application logs | Separate; do not duplicate full audit payloads |

`recordAuditEvent` remains append-only on the supplied client/pool with no BEGIN/COMMIT.

---

## 9. Error propagation

- Existing status codes preserved (`invalid_input`, conflicts, `transaction_error`, …).  
- Standalone catch: safe ROLLBACK then return domain failure (no SQL/secrets).  
- Composed: no inner ROLLBACK on domain failure; unexpected throws trigger outer `safeRollbackOnError` only when the service owns the TX.  
- Rollback failures never replace the original error.  
- `provisioning_failed` persistence **not** implemented here.

---

## 10. Nested transaction protections

- Composed mode forbids Pool (would imply nested ownership).  
- Tests instrument client and assert zero inner BEGIN/COMMIT/ROLLBACK/release.  
- No silent swallow of TX-state errors beyond safe rollback-on-error for owned sessions.

---

## 11. Password-hashing boundary

`createBlessBoardUser` hashes with bcrypt **before** `BEGIN` / session open so CPU work does not hold the transaction.  
`bcrypt.compare` for idempotent “already exists” remains after email lookup (short).

---

## 12. Tests

| Suite | Result |
|-------|--------|
| `tests/blessboard-provisioning-tx-composability.test.js` | Pass (standalone ownership, composed no-control, full-chain commit, full-chain rollback, failure propagation) |
| `tests/platform-tenant-provisioning.test.js` | Pass (incl. unique race + updated table list) |
| `tests/blessboard-church-provisioning.test.js` | Pass |
| Register / schema / CLI safety | Pass |

Live testing DB: **no** permanent provisioning; ephemeral local Postgres only.

---

## 13. Live-data safety

- Did not migrate  
- Did not modify the three registration applications  
- Did not create permanent orgs/users on hosted testing  

---

## 14. Deferred Phase 3 work

- `provisionRegisteredBlessBoardChurch` orchestrator  
- Application row lock + idempotency  
- `skipDomain: true` for Foundation Free  
- Persist `provisioning_failed` in a **separate** short TX after rollback  
- Insert `organization_onboarding`  
- Wire `/register-church` instant provision  

---

## 15. Rollback guidance

- Revert service + helper commits; CLI callers need no migration reverse.  
- No schema changes in this phase.

---

## 16. Scope confirmation

- No migration created or executed  
- No registration route behavior changed  
- No orchestrator  
- No application/onboarding status writes  
- No portal/admin/dashboard/path routing  
- No V4 changes  
- Runtime DDL disabled; `GETPRO_DATABASE_URL` unused  
