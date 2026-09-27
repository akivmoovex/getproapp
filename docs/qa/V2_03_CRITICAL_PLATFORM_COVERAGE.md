# V2.03 QA — Critical Platform Test Gaps (QA06)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_03_CRITICAL_PLATFORM_COVERAGE` |
| **Date** | 2026-09-27 |
| **Branch** | `V10` |
| **Prerequisite** | [QA05 Risk Coverage Matrix](./V2_03_TEST_COVERAGE_MATRIX.md) |
| **Mode** | ADD TESTS ONLY (no application refactor for coverage) |
| **Verdict** | **`V203_CRITICAL_PLATFORM_COVERAGE_PASS`** |
| **Defects found** | **None** (no STOP / separate defect classification) |

---

## Scope

Closed QA05 **P1 negative-uniformity / media-write / CMS-write / host-mismatch / publish-RBAC** platform gaps only. Did **not** expand into AC radiology or billing depth (product P0; separate track).

Priority surfaces covered:

1. Tenant isolation  
2. Authentication / session  
3. RBAC  
4. Publish authorization  
5. Registration / provisioning  
6. Canonical DB / bootstrap  
7. Destructive / write operations  
8. Media ownership  
9. CMS write scope  
10. Audit / security boundaries  

---

## Suite added

`tests/v203-critical-platform-security.test.js`

Mutation contract exercised where applicable:

| Cell | Evidence |
|------|----------|
| authorized same-tenant → succeeds | CMS draft save, publish (admin grants), media meta, folder create |
| unauthenticated → rejected | empty org CMS write; forged-body middleware with null trusted scope |
| unauthorized role → rejected | editor cannot publish; empty grants cannot publish |
| cross-tenant → rejected | CMS / publish / media archive+meta+assert / folder rename |
| forged scope/body IDs → rejected | `rejectForgedTenantIdentifiers` + middleware + forged org CMS |
| invalid resource → rejected | empty content key; missing instance/media/folder name |

Unit/service gates also cover session secret fail-closed, password policy, website instance scope, audit read tenant mismatch + metadata redaction, platform-line host mismatch, and canonical migration ceiling 043/118/042.

---

## Verification run

```bash
node --test --test-concurrency=1 tests/v203-critical-platform-security.test.js
# → 16/16 pass; prints V203_CRITICAL_PLATFORM_COVERAGE_PASS
```

Full platform / security suites re-run (all green):

| Script / file | Result |
|---------------|--------|
| `test:v8:auth-security` | pass |
| `test:v8:session-security` | pass |
| `test:v8:rbac-isolation` | pass |
| `test:v8:tenant-isolation` | pass |
| `test:v8:env-isolation` | pass |
| `test:v8:verification` | pass |
| `test:platform:resolution` | pass |
| `test:platform:http-context` | pass |
| `test:platform:host-comparison` | pass |
| `test:platform:provisioning` | pass |
| `test:platform:sessions` | pass |
| `test:platform:entitlements` | pass |
| `tests/v10-pc02-platform-consolidation-characterization.test.js` | pass |
| `tests/blessboard-p0-publish-auth.test.js` | pass |

---

## Residual (explicitly out of QA06)

- AC billing/cashier depth + radiology (QA05 P0 product gaps)
- BlessBoard editor route line % / publication bridge branch % (coverage depth, not missing security matrix)
- AC registration/portal PL11 pin debt (contract pins, not platform authz)

---

## Marker

```text
V203_CRITICAL_PLATFORM_COVERAGE_PASS
```
