# V2.04 BB Stitch — Phase 2 M01/M02

| Field | Value |
|-------|--------|
| **Phase** | 2 — MEMBER DIRECTORY + ADD MEMBER |
| **Branch** | `V4` |
| **Stitch** | `projects/12773983203917549893` · BB-M01 / BB-M02 |
| **Result** | **BB_V204_M01_M02_PARITY_PASS** |

## Delivered

### BB-M01 Members Directory (`/branch-admin/members`)
- Restyled to Stitch hierarchy: title **Members**, search (name/phone/Church ID), membership status + portal filters, chips (All / Active / Portal Pending), table + mobile cards with Church ID, membership + portal chips, View Profile, Add Member CTA (when `members.create`).
- List API now returns `memberNumber` + `portalAccessStatus`; search includes Church ID; portal query filter supported.
- Legacy BB18 overview metrics retained below directory for compatibility.

### BB-M02 Add Member (`/branch-admin/members/new`)
- GET/POST gated by `members.create` (authorized staff only; no self-create).
- Sections: Identity, Contact, Membership, Personal & Family, Emergency / Next of Kin.
- Church ID auto-provisioned (`CH-NNNNN`, org-scoped unique); portal always `not_activated` on create.
- Email optional; phone via shared phone-field + normalization; uses `createStaffManagedMember` + duplicate engine.
- Gender / baptism collected for Stitch parity (not persisted yet — schema gap).
- Business logic in `blessBoardStaffAddMemberFormService.js` (not EJS).

## Gaps
1. Dedicated Stitch mobile frames absent — responsive from desktop.
2. Gender / baptism not persisted (no columns yet).
3. ~~M03 duplicate-match UI not implemented~~ → completed in Phase 3 (`V2_04_BB_MEMBER_CREATION_FLOW.md`).
4. HQ Add Member UI not added (HQ directory portal filter wired; create remains branch-admin primary).
5. Export / Batch Actions from Stitch omitted (non-functional chrome avoided).

## Tests
`node --test tests/v2-04-bb-m01-m02-members.test.js tests/v2-04-bb-member-domain.test.js tests/v8-bb-membership.test.js` — pass.

BB_V204_M01_M02_PARITY_PASS
