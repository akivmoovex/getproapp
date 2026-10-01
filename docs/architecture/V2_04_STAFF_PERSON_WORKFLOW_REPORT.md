# V2.04 — Staff-Managed Person Workflow

## Phase 3 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_STAFF_PERSON_WORKFLOW_REPORT` |
| **Phase** | 3 — STAFF MANAGED RECORD WORKFLOW |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **Prior** | Phase 1 person contracts, Phase 2 duplicate engine |
| **UI / Stitch** | **Not implemented** |

---

## 1. Objective

Reusable staff workflow for:

- BlessBoard: authorized staff → **Add Member**
- ActiveClinic: authorized staff → **Add Patient**

Orchestration contract (platform-owned):

```text
authorize
→ normalize
→ search/match
→ duplicate evaluation
→ create/reuse person
→ invoke product adapter
→ audit
→ return result
```

**No** generic `memberPatient` domain. Product semantics stay in adapters.

---

## 2. Platform artifacts

| Path | Role |
|------|------|
| `src/platform/person/workflow/staffPersonWorkflow.js` | Orchestrator |
| `src/platform/person/workflow/staffPersonAdapterContract.js` | Adapter shape check |
| `src/platform/person/workflow/staffPersonWorkflowCodes.js` | Result codes |
| `src/platform/person/workflow/index.js` | Exports |

Registry: `personProductAdapter.staffManagedWorkflow` for each product.

Audit: `person.staff_workflow.completed` / `person.staff_workflow.denied` catalogue keys.

Platform workflow **does not** `require` BlessBoard or ActiveClinic.

---

## 3. Product adapter contract

Each adapter controls:

| Concern | Adapter method / field |
|---------|------------------------|
| Product permissions | `authorize`, `createPermissionKey` |
| Required product fields | `normalizeProductFields` |
| Product identifier | returned as `productIdentifier` (Church ID / Patient Number) |
| Candidate search | `loadDuplicateCandidates` |
| Duplicate policy | `duplicatePolicy` + `presentMatch` |
| Relationship create | `createProductRelationship` |
| Relationship status | `relationshipStatus` |
| Org / location | `location` (church/branch or HCO/facility) |
| Portal access status | `portalAccessStatus` (`none` allowed for staff-created) |

---

## 4. BlessBoard adapter

`src/blessboard/services/blessBoardStaffMemberWorkflowAdapter.js`

Supports:

- **Church ID** → `member_number` (additive column)
- Organization + **church** + **branch**
- **Membership status** (`pending|active|inactive|suspended`)
- **Portal access status** (`none|invited|active`) — staff create may leave portal `none`
- Permission: `members.create`
- Duplicate policy: Church ID **BLOCK**; phone/email/name+DOB **WARN**

Migration: `db/migrations/blessboard/119_member_number_church_id.sql` (additive, reversible notes).

Repo: `insertMember` + `findStaffDuplicateMemberCandidates` updated for `member_number`.

---

## 5. ActiveClinic adapter

`src/activeclinic/services/activeClinicStaffPatientWorkflowAdapter.js`

Supports:

- **Patient Number** (allocated by existing `registerActiveClinicPatient`)
- **HCO** + **facility**
- **Patient status** (create-time `active|inactive`)
- **Portal access status** (`none|linked|active`) — staff create without portal OK
- Patient-specific demographics via existing registration path
- Permission: `activeclinic.patient.create`
- Duplicate policy: exact ID **BLOCK**; phone/demographic **WARN_REVIEW** (override)

**Clinical data excluded** from adapter normalize (`diagnosis`, `encounter`, `prescription`, clinical notes, etc.).

Reuses ACN10 registration + Phase 2 shared match engine; does not invent a second patient create stack.

---

## 6. Audit metadata recorded

On success (`person.staff_workflow.completed`):

| Field | Source |
|-------|--------|
| actor | `actorUserId` / `actorIdentityId` |
| action | catalogue key |
| person | `person_id`, `person_created` |
| product relationship | `subject_ref`, `relationship_key`, link id |
| organization | `organizationId` |
| location | church/branch or HCO/facility |
| timestamp | audit service |
| source | `staff_api` / `test` / … |
| reason | override reason when relevant |
| match | `overall_match_code`, `duplicate_override` |

---

## 7. Tests

`tests/v2-04-staff-person-workflow.test.js`

Coverage:

- Adapter contract completeness
- BB normalize (Church ID, branch, portal none)
- BB rejects clinical fields
- AC normalize (HCO, facility, portal none)
- AC rejects clinical / BB fields
- Full BB orchestration + audit
- BB Church ID duplicate **BLOCK**
- AC happy path + clinical rejection
- AC phone match → override required
- Unauthorized short-circuit
- Registry `staffManagedWorkflow` wiring
- Additive migration presence
- Platform workflow has no product `require`s

Evidence: **14 pass / 0 fail**.

---

## 8. Explicit non-goals (this phase)

- No Stitch / EJS screens
- No automatic merge
- No clinical ledger changes
- No replacement of existing AC `registerActiveClinicPatient` public API (adapter composes it)
- No production migration apply / deploy

---

## 9. How callers use it (later UI)

```js
const { runStaffManagedPersonWorkflow } = require("./src/platform/person/workflow");

await runStaffManagedPersonWorkflow(db, {
  productCode: "blessboard", // or "activeclinic"
  trusted: { organizationId, churchId, branchId }, // AC: facilityId
  actor: { userId } /* AC: staffMemberId */,
  demographics: { firstName, lastName, phoneNormalized, email, dateOfBirth },
  product: { /* product-specific fields */ },
  duplicateOverride: false,
  source: "staff_api",
});
```

Adapters resolve from `productRuntimeRegistry` unless `adapter` is injected (tests).

---

PHASE3_STAFF_PERSON_WORKFLOW_PASS
