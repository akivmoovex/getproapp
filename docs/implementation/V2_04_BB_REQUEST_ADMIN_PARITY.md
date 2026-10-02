# V2.04 — BB Request Administration (BB-R01–R04)

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_REQUEST_ADMIN_PARITY` |
| **Phase** | 10 — REQUEST ADMINISTRATION |
| **Branch** | `V4` |
| **Finish** | **`BB_V204_REQUEST_ADMIN_PARITY_PASS`** |
| **Stitch project** | `projects/12773983203917549893` |

---

## Screens

| Code | Stitch ID | Route | Template |
|------|-----------|-------|----------|
| **BB-R01** | Desktop `ff1bcec5a0274ca88ad46d2e889b80e8` · Mobile `bb1a2125b67f45d28eb18c1f43132dbd` | `GET /branch-admin/join-requests` | `join-requests/inbox.ejs` |
| **BB-R02** | Desktop `79b654c9af18411a839a07c616e39e86` · Mobile `f8c014f3282549f1939920a39e2c382b` | `GET /branch-admin/join-requests/:id` | `join-requests/review.ejs` |
| **BB-R03** | `ddc98054601e4362ad7e1f051efa83bb` | `GET …/:id/decision` · `POST …/:id/decide` | `join-requests/decision.ejs` |
| **BB-R04** | `fe42f3a5c09146738394018a7b78f6bf` | `GET /branch-admin/join-requests/ministries/:ministryId` | `join-requests/ministry-members.ejs` |

Pastoral `/branch-admin/requests` (`forms-requests/admin-*.ejs`) **preserved** — not overwritten.

---

## Reuse

| Layer | Artifact |
|-------|----------|
| Platform | `requestApprovalWorkflow` · statuses `pending` / `approved` / `rejected` / `cancelled` · self-approval denial · decision audit |
| BB adapter | `blessBoardJoinRequestService` · `assertResourceScopedReview` · `reviewJoinRequest` |
| HTTP | `joinRequestAdminRoutes.js` · mounted in `v5FoundationServer.js` |
| Membership | `createPgMembershipStore()` for HTTP (links via `approval_request_id`) |

---

## Rules verified

| Rule | Result |
|------|--------|
| Ministry join → **PENDING** (no auto membership) | PASS |
| Approve → active ministry/department relationship | PASS |
| Reject reason required (≥3 chars) | PASS |
| Cancel | PASS |
| Self-approval denial | PASS |
| Wrong ministry leader (resource scope) | PASS |
| Wrong tenant | PASS |
| Duplicate pending | PASS |
| Decision audited | PASS |

Broader reviewers use `events.manage`. Resource-scoped leaders use `managedResourceIds` (injectable via `deps.resolveManagedResourceIds`).

---

## Tests

`tests/v2-04-bb-request-admin.test.js` — Stitch markers, pastoral preservation, CSS/mount, approve/reject/cancel/self/wrong-leader/tenant/duplicate/audit.

```text
BB_V204_REQUEST_ADMIN_PARITY_PASS
```
