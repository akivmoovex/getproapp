# V2.04 — BlessBoard Member Domain Foundation

## Phase 4 Implementation Report

| Field | Value |
|-------|--------|
| **Doc ID** | `V2_04_BB_MEMBER_DOMAIN_REPORT` |
| **Phase** | 4 — MEMBER DOMAIN FOUNDATION |
| **Branch** | `V4` |
| **Date** | 2026-09-30 |
| **UI / Stitch** | **Not implemented** |
| **Visitor UI** | **Not implemented** |

---

## 1. Rules enforced

| # | Rule | Enforcement |
|---|------|-------------|
| 1 | Membership created by authorized church users | `createStaffManagedMember` + `members.create` |
| 2 | Members cannot self-create membership | `assertStaffActor` / `SELF_CREATE_FORBIDDEN` |
| 3–5 | Church ID church-controlled, unique, immutable for members | `member_number` + unique index; `manageChurchId` requires `members.manage_church_id`; member self-edit denied |
| 6–7 | Membership ≠ portal; member without portal OK | `status` vs `portal_access_status` (`not_activated` default) |
| 8–9 | Visitor / New Convert / Prep never auto-create membership | `assertVisitorConversionDoesNotCreateMembership` |
| 10 | Reuse Person when safely identified | `findReusablePersonForMember` (exact phone/email within org) |

---

## 2. Status model

**Membership** (`blessboard.members.status`):

`active` | `inactive` | `transferred` | `former` | `deceased`  
(+ legacy `pending` / `suspended` / `archived` retained for compatibility)

**Portal** (`portal_access_status`):

`not_activated` | `active` | `blocked`

Portal block/unblock does **not** change membership status.

**V2.04 transition matrix (TEMPORARY_APPROVED_FOR_V2_04):**  
See `docs/product/V2_04_BB_MEMBERSHIP_PORTAL_STATUS_MATRIX.md` (PD-V204-BB-04).  
Enforced in `membershipPortalLifecycle.js` + `setMembershipStatus` / `setPortalAccessStatus`.  
Non-active membership clears ordinary ACTIVE portal access. Privileged transitions are audited.

**Church ID uniqueness (PD-V204-BB-01):** unique per `church_id` (sibling churches may share the same Church ID string).

**Tenant bind (PD-V204-BB-02):** Select Church binds session; Church ID resolved only inside selected church.

**Recovery (PD-V204-BB-03):** verified phone OTP only for V2.04; no email recovery fallback.

---

## 3. Permissions (platform RBAC catalogue)

Reused / added (roles receive these — not Pastor/Secretary hard-codes):

| Permission | Use |
|------------|-----|
| `members.view` | Existing |
| `members.create` | Staff create |
| `members.edit` | Profile / membership status |
| `members.block` | **New** — portal block/unblock |
| `members.manage_church_id` | **New** — assign/change Church ID |

Granted to catalogue admin roles: `organisation_administrator`, `church_system_administrator`, `branch_administrator`, `platform_administrator`.

---

## 4. Profile fields (backend, no UI)

Editable via `updateMemberProfile` (staff or member-self with restrictions):

- name, phone (verification-gated on change), DOB
- residence/address
- occupation, marital status, number of children
- next of kin / emergency contact

**Not member-editable:** Church ID, official membership branch.

Phone change sets `phone_pending_*` + `phone_verification_required` until confirmed.

---

## 5. Artifacts

### Migration
- `db/migrations/blessboard/120_member_domain_v204.sql` (additive)

### Domain
- `src/blessboard/services/memberDomainConstants.js`
- `src/blessboard/services/blessBoardMemberDomainService.js`
  - `createStaffManagedMember`
  - `updateMemberProfile`
  - `manageChurchId`
  - `setPortalAccessStatus`
  - `setMembershipStatus`
  - `findReusablePersonForMember`

### Repo / adapter updates
- `memberIdentityRepository` — profile columns, Church ID helpers, portal/lifecycle updates
- Staff workflow adapter — portal `not_activated` + profile pass-through

### Tests
- `tests/v2-04-bb-member-domain.test.js` (13 cases)

---

## 6. Test coverage

- create (staff, portal `not_activated`)
- duplicate Church ID
- person reuse (exact / ambiguous)
- authorization (`members.create` / `church_id.manage` / `block`)
- block/unblock portal vs membership
- immutable Church ID for member
- tenant isolation
- branch not member-editable
- portal/membership state separation
- phone verification on change
- visitor auto-membership forbidden

Evidence: Phase 4 + Phase 3 suites **27 pass / 0 fail**.

---

## 7. Explicit non-goals

- No final Stitch member screens
- No visitor UI
- No production migration apply / deploy
- No automatic visitor → member conversion

---

PHASE4_BB_MEMBER_DOMAIN_PASS
