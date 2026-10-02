# V2.04 — Request / Approval Foundation

## Phase 7 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_REQUEST_APPROVAL_REPORT` |
| **Phase** | 7 — REQUEST / APPROVAL FOUNDATION |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **UI / Stitch** | **Not implemented** |

---

## 1. Audit summary (reuse first)

| Existing surface | Status | Phase 7 relationship |
|------------------|--------|----------------------|
| `blessboard.ministry_memberships` (`pending`/`active`/…) | **Reuse** | Join still creates **pending** membership; linked via `approval_request_id` |
| `participationService.joinMinistry` / `reviewMinistryMembership` | **Preserved** | Compatible aggregate path; new adapter is the V2.04 approval-linked path |
| `blessboard.department_memberships` | **Extended** | Add `pending`/`rejected`/`cancelled` + optional `join_policy` |
| Legacy `church_ministry_join_requests` | **Untouched** | Parallel legacy stack; not replaced |
| `formsRequestsService` member requests | **Untouched** | Pastoral/prayer queue — different product semantics |
| Welfare / website self-approval patterns | **Pattern reused** | Platform enforces self-approval denial centrally |
| Platform registration / website approval | **Separate** | Not merged into this workflow |

**Decision:** Platform owns a reusable approval-request engine; BlessBoard adapters own ministry/department join semantics. No generic “memberPatient” merge; no Stitch UI.

---

## 2. Platform workflow

**Statuses:** `pending` → `approved` | `rejected` | `cancelled` (terminal).

**Core fields** (`platform.approval_requests`):

- requester (subject type + id, optional `requester_user_id`)
- request type, target type/id
- organization, product code
- status, assigned reviewer
- created / decision timestamps, decision actor, decision reason
- append-only `platform.approval_request_decisions` history

**Server-side rule:** requester **must not** approve or reject their own request (`SELF_APPROVAL_DENIED`). Cancel by requester is allowed.

**Duplicates:** one pending row per `(organization, product, request_type, requester, target)`.

Artifacts:

- `db/migrations/platform/047_approval_request_foundation.sql`
- `src/platform/requestApproval/*`

Platform module does **not** `require` BlessBoard or ActiveClinic.

---

## 3. BlessBoard adapter — ministry / department join

| Rule | Enforcement |
|------|-------------|
| Join creates **PENDING** request | `requestMinistryJoin` / `requestDepartmentJoin` |
| Must **not** immediately add active member | Membership inserted as `pending` only |
| Approval activates membership | `reviewJoinRequest(decision: approve)` → `active` |
| Reject / cancel | Membership → `rejected` / `cancelled` |
| Resource-scoped review | `assertResourceScopedReview` — leader only if `managedResourceIds` contains target, unless broader permission |
| Self-approval | Platform rule |

Request types: `ministry.join`, `department.join`.

Migration: `db/migrations/blessboard/122_department_join_request_v204.sql`  
Service: `src/blessboard/services/joinRequest/*`

---

## 4. Tests

`tests/v2-04-request-approval.test.js`

- create → pending
- approve / reject / cancel
- self-approval denial
- resource scope (managed ministry only)
- tenant isolation
- duplicate pending handling
- ministry + department pending (not active on create)
- migrations additive; platform has no product requires

Evidence: **13 pass / 0 fail**.

---

## 5. Explicit non-goals

- No final Stitch join/approval screens
- No rewrite of legacy church join-request UI
- No production migration apply / deploy
- Existing open-policy auto-active ministry join in `participationService` remains for compatibility; V2.04 approval-linked joins use the new adapter

---

PHASE7_REQUEST_APPROVAL_PASS
